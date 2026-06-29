"""ICD-10 / CPT code prediction API (Colab-trained Random Forest models)."""
from flask import Blueprint, jsonify, request
from flask_login import login_required

from ai_models.src.predict import ModelArtifactsError, predict_cpt, predict_icd

coding_bp = Blueprint("coding", __name__)


@coding_bp.post("/predict-codes")
@login_required
def predict_codes():
    """
    Predict ICD-10 and CPT codes from a clinical note.

    Request JSON:
        {"clinical_note": "Patient presents with hypertension..."}

    Response JSON:
        {
          "icd10": {"predicted_code": "...", "confidence": 0.93, "top_predictions": [...]},
          "cpt":   {"predicted_code": "...", "confidence": 0.81, "top_predictions": [...]}
        }
    """
    payload = request.get_json(silent=True) or {}
    note = (payload.get("clinical_note") or "").strip()

    if not note:
        return jsonify({"error": "clinical_note is required"}), 400

    try:
        return jsonify(
            {
                "icd10": predict_icd(note),
                "cpt": predict_cpt(note),
            }
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except ModelArtifactsError as exc:
        return jsonify({"error": str(exc)}), 503
