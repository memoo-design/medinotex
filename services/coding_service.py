"""
Clinical coding helpers — derive ICD/CPT suggestions from note or SOAP text.

Priority for source text:
  1. SOAP summary (if available)
  2. AI summary text (if added later)
  3. extracted_text / ocr_text
  4. original_text / raw_text

Replace ``_rule_based_suggestions`` with a Random Forest model later without
changing the public ``suggest_codes`` / ``get_or_create_suggestions`` API.
"""
from __future__ import annotations

import json
import re
from typing import Any


# ── Rule definitions (swap for ML model output later) ─────────────────────────
ICD_RULES = [
  {"terms": ["hypertension", "blood pressure", "bp "], "code": "I10", "description": "Essential hypertension", "confidence": 0.86},
  {"terms": ["chest pain", "thoracic pain", "angina"], "code": "R07.9", "description": "Chest pain, unspecified", "confidence": 0.82},
  {"terms": ["diabetes", "glucose", "a1c", "hyperglycemia"], "code": "E11.9", "description": "Type 2 diabetes mellitus without complications", "confidence": 0.84},
  {"terms": ["copd", "dyspnea", "shortness of breath"], "code": "J44.9", "description": "COPD, unspecified", "confidence": 0.80},
  {"terms": ["pneumonia", "lung infection"], "code": "J18.9", "description": "Pneumonia, unspecified organism", "confidence": 0.85},
]

CPT_RULES = [
  {"terms": ["follow-up visit", "follow up", "follow-up"], "code": "99213", "description": "Office/outpatient visit, established patient", "confidence": 0.75},
  {"terms": ["consultation", "office visit", "outpatient visit"], "code": "99214", "description": "Office/outpatient visit, established patient", "confidence": 0.78},
  {"terms": ["initial", "new patient"], "code": "99203", "description": "Office/outpatient visit, new patient", "confidence": 0.77},
  {"terms": ["ecg", "electrocardiogram", "ekg"], "code": "93000", "description": "Electrocardiogram, complete", "confidence": 0.88},
  {"terms": ["x-ray", "xray", "radiograph", "chest x-ray"], "code": "71046", "description": "Radiologic examination, chest; 2 views", "confidence": 0.83},
  {"terms": ["wound repair", "laceration repair", "suture"], "code": "12001", "description": "Simple repair of superficial wounds", "confidence": 0.79},
]


def _soap_text(summary) -> str:
    if not summary:
        return ""
    parts = [
        getattr(summary, "subjective", None),
        getattr(summary, "objective", None),
        getattr(summary, "assessment", None),
        getattr(summary, "plan", None),
    ]
    return "\n".join(p.strip() for p in parts if p and str(p).strip()).strip()


def summary_has_ai_content(summary) -> bool:
    return bool(_soap_text(summary))


def clinical_text_for_coding(note, summary=None) -> str:
    """Best text for coding suggestions (SOAP first)."""
    soap = _soap_text(summary)
    if soap:
        return soap

    summary_text = getattr(summary, "summary_text", None) if summary else None
    if summary_text and str(summary_text).strip():
        return str(summary_text).strip()

    if note:
        extracted = (getattr(note, "ocr_text", None) or "").strip()
        if extracted:
            return extracted
        original = (getattr(note, "raw_text", None) or "").strip()
        if original:
            return original

    return ""


def original_note_text(note) -> str:
    """Raw / OCR text for display (not SOAP)."""
    if not note:
        return ""
    return (getattr(note, "ocr_text", None) or getattr(note, "raw_text", None) or "").strip()


def _match_rules(text: str, rules: list[dict], code_type: str) -> tuple[list[dict], list[dict]]:
    lower = text.lower()
    codes: list[dict] = []
    highlights: list[dict] = []
    seen_codes: set[str] = set()

    for rule in rules:
        matched_term = None
        for term in rule["terms"]:
            if term in lower:
                matched_term = term
                break
        if not matched_term or rule["code"] in seen_codes:
            continue
        seen_codes.add(rule["code"])
        entry = {
            "code": rule["code"],
            "description": rule["description"],
            "mapped_text": matched_term,
            "confidence": rule["confidence"],
            "method": "rule_based",
        }
        codes.append(entry)
        highlights.append({
            "term": matched_term,
            "code": rule["code"],
            "type": code_type,
            "description": rule["description"],
        })

    return codes, highlights


def _rule_based_suggestions(text: str) -> dict[str, Any]:
    """Placeholder / rule-based engine — replace with Random Forest later."""
    if not text:
        return {
            "icd_codes": [],
            "cpt_codes": [],
            "highlighted_terms": [],
            "method": "placeholder",
            "confidence": 0.0,
            "warning": "No text available for coding",
        }

    icd_codes, icd_highlights = _match_rules(text, ICD_RULES, "icd")
    cpt_codes, cpt_highlights = _match_rules(text, CPT_RULES, "cpt")

    if not icd_codes:
        icd_codes.append({
            "code": "Z00.00",
            "description": "General adult medical examination",
            "mapped_text": "",
            "confidence": 0.55,
            "method": "placeholder",
        })
    if not cpt_codes:
        cpt_codes.append({
            "code": "99213",
            "description": "Office/outpatient visit, established patient",
            "mapped_text": "",
            "confidence": 0.55,
            "method": "placeholder",
        })

    highlighted_terms = icd_highlights + cpt_highlights
    all_conf = [c["confidence"] for c in icd_codes + cpt_codes]
    avg_conf = round(sum(all_conf) / len(all_conf), 2) if all_conf else 0.0
    method = "rule_based" if highlighted_terms else "placeholder"

    return {
        "icd_codes": icd_codes,
        "cpt_codes": cpt_codes,
        "highlighted_terms": highlighted_terms,
        "method": method,
        "confidence": avg_conf,
        "source_chars": len(text),
    }


def suggest_codes(note, summary=None) -> dict[str, Any]:
    """
    Public API — returns ICD/CPT suggestions in dashboard format.
    Backward-compatible keys: ``icd`` / ``cpt`` mirror ``icd_codes`` / ``cpt_codes``.
    """
    text = clinical_text_for_coding(note, summary)
    result = _rule_based_suggestions(text)
    result["icd"] = result["icd_codes"]
    result["cpt"] = result["cpt_codes"]
    return result


def build_highlighted_html(text: str, highlighted_terms: list[dict]) -> str:
    """Wrap matched clinical terms with highlight spans for the review panel."""
    if not text or not highlighted_terms:
        return _escape_html(text)

    # Longest terms first to avoid partial replacements
    terms = sorted(
        {h["term"] for h in highlighted_terms if h.get("term")},
        key=len,
        reverse=True,
    )
    escaped = _escape_html(text)
    for term in terms:
        related = [h for h in highlighted_terms if h.get("term") == term]
        code = related[0]["code"] if related else ""
        code_type = related[0].get("type", "icd") if related else "icd"
        css = "hl-icd" if code_type == "icd" else "hl-cpt"
        pattern = re.compile(re.escape(term), re.IGNORECASE)

        def _repl(m, css=css, code=code):
            return (
                f'<span class="clinical-highlight {css}" '
                f'data-code="{_escape_attr(code)}" title="{_escape_attr(code)}">'
                f'{m.group(0)}</span>'
            )

        escaped = pattern.sub(_repl, escaped)
    return escaped


def _escape_html(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _escape_attr(s: str) -> str:
    return _escape_html(s).replace("'", "&#39;")


def persist_suggestion(db_session, note_id: int, payload: dict):
    """Save or update code_suggestions row."""
    from models.clinical import CodeSuggestion

    row = CodeSuggestion.query.filter_by(note_id=note_id).first()
    if not row:
        row = CodeSuggestion(note_id=note_id)
        db_session.add(row)

    row.icd_codes = json.dumps(payload.get("icd_codes", []))
    row.cpt_codes = json.dumps(payload.get("cpt_codes", []))
    row.confidence = payload.get("confidence")
    row.method_used = payload.get("method", "rule_based")
    row.highlighted_terms = json.dumps(payload.get("highlighted_terms", []))
    return row
