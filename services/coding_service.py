"""
Clinical coding helpers — derive ICD/CPT suggestions from note or SOAP text.
Priority: SOAP sections → summary_text → ocr_text → raw_text
"""
from __future__ import annotations


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


def suggest_codes(note, summary=None) -> dict:
    """Return ICD/CPT suggestion lists from the best available clinical text."""
    text = clinical_text_for_coding(note, summary)
    if not text:
        return {"icd": [], "cpt": [], "warning": "No text available for coding"}

    icd, cpt = [], []
    lower = text.lower()

    if any(k in lower for k in ("hypertension", "blood pressure", "bp ")):
        icd.append({"code": "I10", "desc": "Essential hypertension"})
    if any(k in lower for k in ("chest pain", "thoracic", "angina")):
        icd.append({"code": "R07.9", "desc": "Chest pain, unspecified"})
    if any(k in lower for k in ("diabetes", "glucose", "a1c")):
        icd.append({"code": "E11.9", "desc": "Type 2 diabetes mellitus without complications"})
    if any(k in lower for k in ("copd", "dyspnea", "shortness of breath")):
        icd.append({"code": "J44.9", "desc": "COPD, unspecified"})

    if any(k in lower for k in ("consultation", "visit", "follow-up", "follow up")):
        cpt.append({"code": "99214", "desc": "Office/outpatient visit, established patient"})
    if "initial" in lower or "new patient" in lower:
        cpt.append({"code": "99203", "desc": "Office/outpatient visit, new patient"})

    if not icd:
        icd.append({"code": "Z00.00", "desc": "General adult medical examination"})
    if not cpt:
        cpt.append({"code": "99213", "desc": "Office/outpatient visit, established patient"})

    return {"icd": icd, "cpt": cpt, "source_chars": len(text)}
