"""
Medical History Routes
GET /api/history/patient/<patient_id> – timeline of case events for a patient
"""
from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from models.patient import Patient
from models.clinical import AISummary, CaseHistory

history_bp = Blueprint("history", __name__)


@history_bp.get("/patient/<int:patient_id>")
@login_required
def patient_history(patient_id):
    patient = Patient.query.filter_by(id=patient_id, doctor_id=current_user.id).first()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    summaries = (
        AISummary.query
        .filter_by(patient_id=patient_id, doctor_id=current_user.id)
        .all()
    )
    summary_ids = [s.id for s in summaries]

    if not summary_ids:
        return jsonify({"patient_id": patient_id, "entries": []}), 200

    events = (
        CaseHistory.query
        .filter(CaseHistory.summary_id.in_(summary_ids))
        .order_by(CaseHistory.created_at.desc())
        .all()
    )

    entries = []
    for ev in events:
        summary = next((s for s in summaries if s.id == ev.summary_id), None)
        entries.append({
            "at":         ev.created_at.isoformat(),
            "event":      ev.event,
            "summary_id": ev.summary_id,
            "visit_type": summary.note.visit_type if summary and summary.note else None,
        })

    return jsonify({"patient_id": patient_id, "entries": entries}), 200
