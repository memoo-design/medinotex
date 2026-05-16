"""
Azure AI Language Service
Extracts key phrases + healthcare entities, then builds a SOAP note.
Uses the azure-ai-textanalytics SDK (free F0 tier compatible).
"""
import json
import logging
from flask import current_app

logger = logging.getLogger(__name__)


# ── Public API ────────────────────────────────────────────────────────────────

def generate_soap_summary(clinical_text: str, options: dict = None) -> dict:
    """
    Send clinical text to Azure AI Language and return SOAP sections.

    options = {
        "use_soap":      bool,
        "use_diagnosis": bool,
        "use_treatment": bool,
        "use_risk":      bool,
    }

    Returns:
    {
        "subjective":  str,
        "objective":   str,
        "assessment":  str,
        "plan":        str,
        "key_phrases": list[str],
        "entities":    list[dict],
        "risk_score":  str | None,
    }
    """
    options = options or {}
    endpoint = current_app.config.get("AZURE_LANGUAGE_ENDPOINT", "")
    key      = current_app.config.get("AZURE_LANGUAGE_KEY", "")

    if not endpoint or not key:
        logger.warning("Azure Language credentials missing – using fallback formatter.")
        return _fallback_soap(clinical_text)

    try:
        from azure.ai.textanalytics import TextAnalyticsClient
        from azure.core.credentials import AzureKeyCredential

        client = TextAnalyticsClient(endpoint=endpoint, credential=AzureKeyCredential(key))

        key_phrases = _extract_key_phrases(client, clinical_text)
        entities    = _extract_healthcare_entities(client, clinical_text)
        soap        = _build_soap_from_azure(clinical_text, key_phrases, entities, options)

        return {
            "subjective":  soap["subjective"],
            "objective":   soap["objective"],
            "assessment":  soap["assessment"],
            "plan":        soap["plan"],
            "key_phrases": key_phrases,
            "entities":    entities,
            "risk_score":  _score_risk(entities) if options.get("use_risk") else None,
        }

    except Exception as e:
        logger.error(f"Azure Language Service error: {e}")
        return _fallback_soap(clinical_text)


# ── Azure helpers ─────────────────────────────────────────────────────────────

def _extract_key_phrases(client, text: str) -> list:
    """Call Azure key phrase extraction."""
    try:
        result = client.extract_key_phrases([text])[0]
        if not result.is_error:
            return list(result.key_phrases)
    except Exception as e:
        logger.error(f"Key phrase extraction failed: {e}")
    return []


def _extract_healthcare_entities(client, text: str) -> list:
    """
    Use the Healthcare Named Entity Recognition endpoint.
    Returns list of { category, text, confidence }.
    NOTE: Healthcare NER may require additional feature enablement on your Azure resource.
    Falls back to general NER if unavailable.
    """
    entities_out = []
    try:
        # Try healthcare NER first
        poller  = client.begin_analyze_healthcare_entities([text])
        results = poller.result()
        for doc in results:
            if not doc.is_error:
                for ent in doc.entities:
                    entities_out.append({
                        "text":       ent.text,
                        "category":   ent.category,
                        "confidence": round(ent.confidence_score, 3),
                    })
        return entities_out
    except Exception:
        pass

    # Fallback: general NER
    try:
        result = client.recognize_entities([text])[0]
        if not result.is_error:
            for ent in result.entities:
                entities_out.append({
                    "text":       ent.text,
                    "category":   ent.category,
                    "confidence": round(ent.confidence_score, 3),
                })
    except Exception as e:
        logger.error(f"General NER failed: {e}")

    return entities_out


def _build_soap_from_azure(text: str, key_phrases: list, entities: list, options: dict) -> dict:
    """
    Build SOAP sections using Azure-extracted information.
    Combines heuristic line parsing with extracted entities/phrases.
    """
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    # Attempt to detect pre-formatted SOAP sections
    sections = {"S": [], "O": [], "A": [], "P": []}
    current = None
    for line in lines:
        upper = line.upper()
        if upper.startswith("S:") or upper.startswith("SUBJECTIVE"):
            current = "S"; line = line[2:].strip()
        elif upper.startswith("O:") or upper.startswith("OBJECTIVE"):
            current = "O"; line = line[2:].strip()
        elif upper.startswith("A:") or upper.startswith("ASSESSMENT"):
            current = "A"; line = line[2:].strip()
        elif upper.startswith("P:") or upper.startswith("PLAN"):
            current = "P"; line = line[2:].strip()
        if current and line:
            sections[current].append(line)

    # Build SOAP from detected sections + Azure enrichment
    symptom_entities   = [e["text"] for e in entities if "Symptom" in e.get("category", "")]
    diagnosis_entities = [e["text"] for e in entities if "Diagnosis" in e.get("category", "")]
    medication_ents    = [e["text"] for e in entities if "Medication" in e.get("category", "")]

    subjective  = " ".join(sections["S"]) if sections["S"] else text[:400]
    if symptom_entities:
        subjective += f"\n\n[Key symptoms identified: {', '.join(symptom_entities[:6])}]"

    objective = " ".join(sections["O"]) if sections["O"] else "Objective findings to be documented."

    assessment = " ".join(sections["A"]) if sections["A"] else ""
    if options.get("use_diagnosis") and diagnosis_entities:
        assessment += ("\n\nDiagnosis / Impressions: " + "; ".join(diagnosis_entities[:5]))
    if options.get("use_diagnosis") and key_phrases:
        assessment += ("\n\nClinical key findings: " + ", ".join(key_phrases[:8]))
    if not assessment.strip():
        assessment = "Clinical assessment to be completed by attending physician."

    plan = " ".join(sections["P"]) if sections["P"] else ""
    if options.get("use_treatment") and medication_ents:
        plan += ("\n\nMedications identified: " + ", ".join(medication_ents[:5]))
    if not plan.strip():
        plan = "Treatment plan to be established following review."

    return {
        "subjective": subjective.strip(),
        "objective":  objective.strip(),
        "assessment": assessment.strip(),
        "plan":       plan.strip(),
    }


def _score_risk(entities: list) -> str:
    """Simple heuristic risk score from entity count / categories."""
    high_risk_terms = {"HeartDisease", "ChestPain", "CardiacArrest", "Stroke", "Sepsis"}
    flags = sum(1 for e in entities if any(h.lower() in e.get("text", "").lower() for h in high_risk_terms))
    if flags >= 2:
        return "High"
    if flags == 1:
        return "Moderate"
    return "Low"


# ── Fallback (no Azure credentials) ─────────────────────────────────────────

def _fallback_soap(text: str) -> dict:
    """
    Heuristic-only SOAP builder used when Azure is not configured.
    Useful during development / local testing.
    """
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    soap  = {"S": [], "O": [], "A": [], "P": []}
    cur   = None

    for line in lines:
        upper = line.upper()
        if upper.startswith(("S:", "SUBJECTIVE")):
            cur = "S"; line = line[2:].strip()
        elif upper.startswith(("O:", "OBJECTIVE")):
            cur = "O"; line = line[2:].strip()
        elif upper.startswith(("A:", "ASSESSMENT")):
            cur = "A"; line = line[2:].strip()
        elif upper.startswith(("P:", "PLAN")):
            cur = "P"; line = line[2:].strip()
        if cur and line:
            soap[cur].append(line)

    return {
        "subjective":  " ".join(soap["S"]) or text[:300],
        "objective":   " ".join(soap["O"]) or "Objective data not detected.",
        "assessment":  " ".join(soap["A"]) or "Assessment not detected.",
        "plan":        " ".join(soap["P"]) or "Plan not detected.",
        "key_phrases": [],
        "entities":    [],
        "risk_score":  None,
    }
