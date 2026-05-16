"""
AI Summaries Routes
POST /api/summaries/generate      – call Azure AI Language, store SOAP result
GET  /api/summaries/              – list all summaries for this doctor
GET  /api/summaries/<id>          – single summary with full SOAP sections
GET  /api/summaries/patient/<pid> – summaries for a specific patient
DELETE /api/summaries/<id>        – remove a summary
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime
import json

from extensions import db
from models.clinical import ClinicalNote, AISummary
from models.patient import Patient
from models.clinical import Notification
from services.ai_language import generate_soap_summary

summaries_bp = Blueprint("summaries", __name__)


@summaries_bp.post("/generate")
@login_required
def generate():
    """
    Trigger SOAP generation for an existing clinical note.
    JSON: { note_id }
    """
    data    = request.get_json(silent=True) or {}
    note_id = data.get("note_id")

    if not note_id:
        return jsonify({"error": "note_id is required"}), 400

    note = ClinicalNote.query.filter_by(id=int(note_id), doctor_id=current_user.id).first()
    if not note:
        return jsonify({"error": "Clinical note not found"}), 404

    # If already generated, return existing
    if note.summary:
        return jsonify({"message": "Summary already exists", "summary": note.summary.to_dict()}), 200

    # Get text to process (prefer OCR text from file, else typed text)
    text = (note.ocr_text or note.raw_text or "").strip()
    if not text:
        return jsonify({"error": "No text content found in note to process"}), 422

    options = {
        "use_soap":      note.use_soap,
        "use_diagnosis": note.use_diagnosis,
        "use_treatment": note.use_treatment,
        "use_risk":      note.use_risk,
    }

    # ── Call Azure AI Language ────────────────────────────────────────────
    result = generate_soap_summary(text, options)

    summary = AISummary(
        note_id     = note.id,
        patient_id  = note.patient_id,
        doctor_id   = current_user.id,
        subjective  = result.get("subjective", ""),
        objective   = result.get("objective",  ""),
        assessment  = result.get("assessment", ""),
        plan        = result.get("plan",       ""),
        key_phrases = json.dumps(result.get("key_phrases", [])),
        entities    = json.dumps(result.get("entities",    [])),
        risk_score  = result.get("risk_score"),
    )
    db.session.add(summary)

    # Mark note as processed
    note.processed = True

    # Update patient status
    patient = Patient.query.get(note.patient_id)
    if patient:
        patient.status = "AI Ready"
        if result.get("risk_score") == "High":
            patient.status = "High Risk"

    # Create notification
    notif = Notification(
        doctor_id = current_user.id,
        type      = "success",
        title     = "AI Summary Ready",
        message   = f"SOAP note generated for {patient.name if patient else 'patient'}",
    )
    db.session.add(notif)

    db.session.commit()

    return jsonify({"message": "Summary generated", "summary": summary.to_dict()}), 201


@summaries_bp.get("/")
@login_required
def list_summaries():
    page = int(request.args.get("page", 1))
    per  = int(request.args.get("per_page", 20))

    paginated = (
        AISummary.query
        .filter_by(doctor_id=current_user.id)
        .order_by(AISummary.created_at.desc())
        .paginate(page=page, per_page=per, error_out=False)
    )

    return jsonify({
        "summaries": [s.to_dict() for s in paginated.items],
        "total":     paginated.total,
        "page":      paginated.page,
        "pages":     paginated.pages,
    }), 200


@summaries_bp.get("/<int:summary_id>")
@login_required
def get_summary(summary_id):
    s = AISummary.query.filter_by(id=summary_id, doctor_id=current_user.id).first()
    if not s:
        return jsonify({"error": "Summary not found"}), 404
    return jsonify(s.to_dict()), 200


@summaries_bp.get("/patient/<int:patient_id>")
@login_required
def patient_summaries(patient_id):
    sums = (
        AISummary.query
        .filter_by(patient_id=patient_id, doctor_id=current_user.id)
        .order_by(AISummary.created_at.desc())
        .all()
    )
    return jsonify([s.to_dict() for s in sums]), 200


@summaries_bp.delete("/<int:summary_id>")
@login_required
def delete_summary(summary_id):
    s = AISummary.query.filter_by(id=summary_id, doctor_id=current_user.id).first()
    if not s:
        return jsonify({"error": "Summary not found"}), 404
    db.session.delete(s)
    db.session.commit()
    return jsonify({"message": "Summary deleted"}), 200
