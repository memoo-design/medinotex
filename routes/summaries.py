"""
AI Summaries Routes
POST /api/summaries/generate           – call Azure AI Language, store SOAP result
GET  /api/summaries/                   – list all summaries for this doctor
GET  /api/summaries/revisions          – summaries returned for correction
GET  /api/summaries/<id>               – single summary with full SOAP sections
PUT  /api/summaries/<id>               – update SOAP sections (doctor review)
POST /api/summaries/<id>/submit        – submit to medical coder
GET  /api/summaries/patient/<pid>      – summaries for a specific patient
DELETE /api/summaries/<id>             – remove a summary
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime
import json

from extensions import db
from models.clinical import (
    ClinicalNote, AISummary, Notification,
    WORKFLOW_DOCTOR_REVIEW, WORKFLOW_SUBMITTED_TO_CODER,
    WORKFLOW_RETURNED_FOR_CORRECTION,
)
from models.patient import Patient
from services.ai_language import generate_soap_summary
from services.audit import log_audit
from utils.decorators import role_required

summaries_bp = Blueprint("summaries", __name__)


def _confidence_from_result(result: dict) -> int:
    """Heuristic confidence score from AI extraction quality."""
    phrases = result.get("key_phrases") or []
    entities = result.get("entities") or []
    base = 72
    base += min(len(phrases) * 2, 16)
    base += min(len(entities) * 3, 12)
    if result.get("assessment"):
        base += 4
    return min(base, 98)


@summaries_bp.post("/generate")
@login_required
@role_required("doctor", "admin")
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

    if note.summary:
        return jsonify({
            "message": "Summary already exists",
            "summary": note.summary.to_dict(include_history=True),
        }), 200

    text = (note.ocr_text or note.raw_text or "").strip()
    if not text:
        return jsonify({"error": "No text content found in note to process"}), 422

    options = {
        "use_soap":      note.use_soap,
        "use_diagnosis": note.use_diagnosis,
        "use_treatment": note.use_treatment,
        "use_risk":      note.use_risk,
    }

    result = generate_soap_summary(text, options)

    summary = AISummary(
        note_id          = note.id,
        patient_id       = note.patient_id,
        doctor_id        = current_user.id,
        subjective       = result.get("subjective", ""),
        objective        = result.get("objective",  ""),
        assessment       = result.get("assessment", ""),
        plan             = result.get("plan",       ""),
        key_phrases      = json.dumps(result.get("key_phrases", [])),
        entities         = json.dumps(result.get("entities",    [])),
        risk_score       = result.get("risk_score"),
        workflow_status  = WORKFLOW_DOCTOR_REVIEW,
        ai_confidence    = _confidence_from_result(result),
    )
    db.session.add(summary)
    db.session.flush()

    summary.add_history("Case created from clinical note")
    summary.add_history("AI summary generated — awaiting doctor review")

    note.processed = True

    patient = Patient.query.get(note.patient_id)
    if patient:
        patient.status = "AI Ready"
        if result.get("risk_score") == "High":
            patient.status = "High Risk"

    notif = Notification(
        doctor_id = current_user.id,
        type      = "success",
        title     = "AI Summary Ready",
        message   = f"SOAP note generated for {patient.name if patient else 'patient'}",
    )
    db.session.add(notif)
    log_audit(current_user.id, "summary_generated", "ai_summary", summary.id,
              {"note_id": note.id, "patient_id": note.patient_id})

    db.session.commit()

    return jsonify({
        "message": "Summary generated",
        "summary": summary.to_dict(include_history=True),
    }), 201


@summaries_bp.get("/revisions")
@login_required
@role_required("doctor", "admin")
def list_revisions():
    """Summaries returned by the coder for doctor correction."""
    sums = (
        AISummary.query
        .filter_by(doctor_id=current_user.id, workflow_status=WORKFLOW_RETURNED_FOR_CORRECTION)
        .order_by(AISummary.updated_at.desc())
        .all()
    )
    return jsonify([s.to_dict(include_history=True) for s in sums]), 200


@summaries_bp.get("/")
@login_required
def list_summaries():
    page   = int(request.args.get("page", 1))
    per    = int(request.args.get("per_page", 20))
    status = request.args.get("workflow_status", "").strip()

    query = AISummary.query.filter_by(doctor_id=current_user.id)
    if status:
        query = query.filter_by(workflow_status=status)

    paginated = (
        query
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
    return jsonify(s.to_dict(include_history=True)), 200


@summaries_bp.put("/<int:summary_id>")
@login_required
@role_required("doctor", "admin")
def update_summary(summary_id):
    """Update SOAP sections during doctor review."""
    s = AISummary.query.filter_by(id=summary_id, doctor_id=current_user.id).first()
    if not s:
        return jsonify({"error": "Summary not found"}), 404

    if s.workflow_status not in (
        WORKFLOW_DOCTOR_REVIEW,
        WORKFLOW_RETURNED_FOR_CORRECTION,
    ):
        return jsonify({"error": "Summary cannot be edited in its current workflow state"}), 409

    data = request.get_json(silent=True) or {}
    for field in ("subjective", "objective", "assessment", "plan"):
        if field in data:
            setattr(s, field, data[field])

    if s.workflow_status == WORKFLOW_RETURNED_FOR_CORRECTION:
        s.workflow_status = WORKFLOW_DOCTOR_REVIEW

    s.add_history("Doctor updated SOAP note")
    log_audit(current_user.id, "summary_updated", "ai_summary", s.id)

    db.session.commit()
    return jsonify({"message": "Summary updated", "summary": s.to_dict(include_history=True)}), 200


@summaries_bp.post("/<int:summary_id>/submit")
@login_required
@role_required("doctor", "admin")
def submit_to_coder(summary_id):
    """Submit a reviewed SOAP note to the medical coder queue."""
    s = AISummary.query.filter_by(id=summary_id, doctor_id=current_user.id).first()
    if not s:
        return jsonify({"error": "Summary not found"}), 404

    if s.workflow_status not in (WORKFLOW_DOCTOR_REVIEW, WORKFLOW_RETURNED_FOR_CORRECTION):
        return jsonify({"error": "Only notes in doctor review can be submitted to coder"}), 409

    s.workflow_status = WORKFLOW_SUBMITTED_TO_CODER
    s.submitted_at    = datetime.utcnow()
    s.add_history("Submitted to medical coder")

    patient = Patient.query.get(s.patient_id)
    if patient:
        patient.status = "In Review"

    notif = Notification(
        doctor_id = current_user.id,
        type      = "info",
        title     = "Submitted to Coder",
        message   = f"Case for {patient.name if patient else 'patient'} sent for coding review",
    )
    db.session.add(notif)
    log_audit(current_user.id, "submitted_to_coder", "ai_summary", s.id,
              {"patient_id": s.patient_id})

    db.session.commit()
    return jsonify({"message": "Submitted to coder", "summary": s.to_dict(include_history=True)}), 200


@summaries_bp.get("/patient/<int:patient_id>")
@login_required
def patient_summaries(patient_id):
    patient = Patient.query.filter_by(id=patient_id, doctor_id=current_user.id).first()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    sums = (
        AISummary.query
        .filter_by(patient_id=patient_id, doctor_id=current_user.id)
        .order_by(AISummary.created_at.desc())
        .all()
    )
    return jsonify([s.to_dict(include_history=True) for s in sums]), 200


@summaries_bp.delete("/<int:summary_id>")
@login_required
def delete_summary(summary_id):
    s = AISummary.query.filter_by(id=summary_id, doctor_id=current_user.id).first()
    if not s:
        return jsonify({"error": "Summary not found"}), 404
    log_audit(current_user.id, "summary_deleted", "ai_summary", s.id)
    db.session.delete(s)
    db.session.commit()
    return jsonify({"message": "Summary deleted"}), 200
