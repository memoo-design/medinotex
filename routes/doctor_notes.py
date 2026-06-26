"""
Doctor note workflow routes.
POST /api/doctor/notes/<note_id>/submit-to-coder — submit note with or without AI summary
"""
from datetime import datetime

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from extensions import db
from models.clinical import (
    ClinicalNote,
    AISummary,
    Notification,
    WORKFLOW_DOCTOR_REVIEW,
    WORKFLOW_SUBMITTED_TO_CODER,
    WORKFLOW_RETURNED_FOR_CORRECTION,
)
from models.patient import Patient
from services.audit import log_audit
from services.coding_service import summary_has_ai_content
from utils.decorators import role_required

doctor_notes_bp = Blueprint("doctor_notes", __name__)


def _note_text(note: ClinicalNote) -> str:
    return (note.ocr_text or note.raw_text or "").strip()


@doctor_notes_bp.post("/notes/<int:note_id>/submit-to-coder")
@login_required
@role_required("doctor", "admin")
def submit_note_to_coder(note_id):
    note = ClinicalNote.query.filter_by(id=note_id, doctor_id=current_user.id).first()
    if not note:
        return jsonify({"error": "Clinical note not found"}), 404

    text = _note_text(note)
    if not text:
        return jsonify({"error": "No clinical note text is available to submit"}), 422

    summary = note.summary
    if not summary:
        summary = AISummary(
            note_id=note.id,
            patient_id=note.patient_id,
            doctor_id=current_user.id,
            workflow_status=WORKFLOW_SUBMITTED_TO_CODER,
            submitted_at=datetime.utcnow(),
        )
        summary.add_history("Submitted to medical coder (original note only — no AI summary)")
        db.session.add(summary)
    else:
        if summary.workflow_status == WORKFLOW_SUBMITTED_TO_CODER:
            return jsonify({"error": "Already submitted to coder"}), 409
        if summary.workflow_status not in (
            WORKFLOW_DOCTOR_REVIEW,
            WORKFLOW_RETURNED_FOR_CORRECTION,
        ):
            return jsonify({"error": "Case cannot be submitted in its current state"}), 409
        summary.workflow_status = WORKFLOW_SUBMITTED_TO_CODER
        summary.submitted_at = datetime.utcnow()
        summary.add_history("Submitted to medical coder")

    note.processed = True

    patient = Patient.query.get(note.patient_id)
    if patient:
        patient.status = "In Review"

    notif = Notification(
        doctor_id=current_user.id,
        type="info",
        title="Submitted to Coder",
        message=f"Case for {patient.name if patient else 'patient'} sent for coding review",
    )
    db.session.add(notif)
    log_audit(
        current_user.id,
        "submitted_to_coder",
        "clinical_note",
        note.id,
        {"summary_id": summary.id, "has_ai_summary": summary_has_ai_content(summary)},
    )

    db.session.commit()

    payload = summary.to_dict(include_history=True)
    has_ai = summary_has_ai_content(summary)
    return jsonify({
        "message": "Submitted to coder",
        "summary": payload,
        "has_ai_summary": has_ai,
        "original_text": text,
    }), 200
