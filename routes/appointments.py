"""
Appointments Routes
GET    /api/appointments/         – list appointments (optional ?date= filter)
POST   /api/appointments/         – create appointment
PUT    /api/appointments/<id>     – update (reschedule / change status)
DELETE /api/appointments/<id>     – cancel & delete
GET    /api/appointments/upcoming – next 5 upcoming for dashboard widget
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime, timezone

from extensions import db
from models.clinical import Appointment, Notification
from models.patient import Patient

appointments_bp = Blueprint("appointments", __name__)


@appointments_bp.get("/")
@login_required
def list_appointments():
    status     = request.args.get("status", "")
    date_str   = request.args.get("date", "")
    patient_id = request.args.get("patient_id", "")

    query = Appointment.query.filter_by(doctor_id=current_user.id)

    if status:
        query = query.filter_by(status=status)
    if patient_id:
        query = query.filter_by(patient_id=int(patient_id))
    if date_str:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d")
            from sqlalchemy import func
            query = query.filter(func.date(Appointment.scheduled_at) == d.date())
        except ValueError:
            pass

    appts = query.order_by(Appointment.scheduled_at.asc()).all()
    return jsonify([a.to_dict() for a in appts]), 200


@appointments_bp.get("/upcoming")
@login_required
def upcoming():
    now   = datetime.now(timezone.utc)
    appts = (
        Appointment.query
        .filter(
            Appointment.doctor_id    == current_user.id,
            Appointment.scheduled_at >= now,
            Appointment.status       == "scheduled",
        )
        .order_by(Appointment.scheduled_at.asc())
        .limit(5)
        .all()
    )
    return jsonify([a.to_dict() for a in appts]), 200


@appointments_bp.post("/")
@login_required
def create_appointment():
    data = request.get_json(silent=True) or {}

    patient_id   = data.get("patient_id")
    title        = (data.get("title") or "").strip()
    scheduled_at = data.get("scheduled_at")

    if not patient_id or not title or not scheduled_at:
        return jsonify({"error": "patient_id, title and scheduled_at are required"}), 400

    patient = Patient.query.filter_by(id=int(patient_id), doctor_id=current_user.id).first()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    try:
        dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
    except ValueError:
        return jsonify({"error": "scheduled_at must be ISO 8601 format"}), 400

    appt = Appointment(
        patient_id   = int(patient_id),
        doctor_id    = current_user.id,
        title        = title,
        visit_type   = data.get("visit_type",   "Follow-Up"),
        scheduled_at = dt,
        duration_min = data.get("duration_min", 30),
        notes        = data.get("notes",        ""),
    )
    db.session.add(appt)

    # Notification
    notif = Notification(
        doctor_id = current_user.id,
        type      = "info",
        title     = "Appointment Scheduled",
        message   = f"{patient.name} – {dt.strftime('%b %d at %I:%M %p')}",
    )
    db.session.add(notif)
    db.session.commit()

    return jsonify(appt.to_dict()), 201


@appointments_bp.put("/<int:appt_id>")
@login_required
def update_appointment(appt_id):
    appt = _get_own_appt(appt_id)
    data = request.get_json(silent=True) or {}

    for field in ("title", "visit_type", "duration_min", "notes", "status"):
        if field in data:
            setattr(appt, field, data[field])

    if "scheduled_at" in data:
        try:
            appt.scheduled_at = datetime.fromisoformat(data["scheduled_at"].replace("Z", "+00:00"))
        except ValueError:
            return jsonify({"error": "Invalid scheduled_at format"}), 400

    db.session.commit()
    return jsonify(appt.to_dict()), 200


@appointments_bp.delete("/<int:appt_id>")
@login_required
def delete_appointment(appt_id):
    appt = _get_own_appt(appt_id)
    db.session.delete(appt)
    db.session.commit()
    return jsonify({"message": "Appointment deleted"}), 200


def _get_own_appt(appt_id: int) -> Appointment:
    appt = Appointment.query.filter_by(id=appt_id, doctor_id=current_user.id).first()
    if not appt:
        from flask import abort
        abort(404, description="Appointment not found")
    return appt
