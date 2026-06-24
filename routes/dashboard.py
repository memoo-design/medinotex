"""
Dashboard Stats Route
GET /api/dashboard/stats – returns aggregate counts for the dashboard cards
"""
from flask import Blueprint, jsonify
from flask_login import login_required, current_user
from datetime import datetime, timedelta, timezone

from extensions import db
from models.patient import Patient
from models.clinical import ClinicalNote, AISummary, Appointment, Notification, WORKFLOW_RETURNED_FOR_CORRECTION

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/stats")
@login_required
def stats():
    now      = datetime.now(timezone.utc)
    today    = now.date()
    week_ago = now - timedelta(days=7)

    doctor_id = current_user.id

    total_patients = Patient.query.filter_by(doctor_id=doctor_id).count()
    ai_summaries   = AISummary.query.filter_by(doctor_id=doctor_id).count()
    high_risk      = Patient.query.filter_by(doctor_id=doctor_id, status="High Risk").count()

    # Appointments today
    from sqlalchemy import func
    appts_today = (
        Appointment.query
        .filter(
            Appointment.doctor_id    == doctor_id,
            func.date(Appointment.scheduled_at) == today,
            Appointment.status       == "scheduled",
        )
        .count()
    )

    # Notes this week
    notes_this_week = (
        ClinicalNote.query
        .filter(
            ClinicalNote.doctor_id  == doctor_id,
            ClinicalNote.created_at >= week_ago,
        )
        .count()
    )

    # Recent patient activity (last 5 patients with notes)
    recent_patients = (
        Patient.query
        .filter_by(doctor_id=doctor_id)
        .order_by(Patient.last_visit.desc().nullslast())
        .limit(5)
        .all()
    )

    # Unread notifications count
    unread_notifs = Notification.query.filter_by(doctor_id=doctor_id, is_read=False).count()

    revisions_needed = (
        AISummary.query
        .filter_by(doctor_id=doctor_id, workflow_status=WORKFLOW_RETURNED_FOR_CORRECTION)
        .count()
    )

    recent_cases = (
        AISummary.query
        .filter_by(doctor_id=doctor_id)
        .order_by(AISummary.updated_at.desc())
        .limit(5)
        .all()
    )

    return jsonify({
        "total_patients":  total_patients,
        "ai_summaries":    ai_summaries,
        "high_risk_count": high_risk,
        "appts_today":     appts_today,
        "notes_this_week": notes_this_week,
        "unread_notifs":   unread_notifs,
        "revisions_needed": revisions_needed,
        "recent_patients": [p.to_dict() for p in recent_patients],
        "recent_cases":    [c.to_dict() for c in recent_cases],
    }), 200
