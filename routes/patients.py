"""
Patient Routes
GET    /api/patients/          – list all patients for logged-in doctor
POST   /api/patients/          – add new patient
GET    /api/patients/<id>       – get single patient
PUT    /api/patients/<id>       – update patient
DELETE /api/patients/<id>       – delete patient
GET    /api/patients/search     – search by name or diagnosis
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime

from extensions import db
from models.patient import Patient

patients_bp = Blueprint("patients", __name__)


@patients_bp.get("/")
@login_required
def list_patients():
    q      = request.args.get("q", "").strip()
    status = request.args.get("status", "").strip()
    page   = int(request.args.get("page", 1))
    per    = int(request.args.get("per_page", 20))

    query = Patient.query.filter_by(doctor_id=current_user.id)

    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(Patient.name.ilike(like), Patient.diagnosis.ilike(like))
        )
    if status:
        query = query.filter_by(status=status)

    paginated = query.order_by(Patient.last_visit.desc().nullslast()).paginate(page=page, per_page=per, error_out=False)

    return jsonify({
        "patients":    [p.to_dict() for p in paginated.items],
        "total":       paginated.total,
        "page":        paginated.page,
        "pages":       paginated.pages,
    }), 200


@patients_bp.post("/")
@login_required
def add_patient():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Patient name is required"}), 400

    patient = Patient(
        doctor_id   = current_user.id,
        name        = name,
        age         = data.get("age"),
        sex         = data.get("sex"),
        diagnosis   = data.get("diagnosis", ""),
        status      = data.get("status", "Pending"),
        avatar_seed = data.get("avatar_seed", name.split()[0].lower()),
        avatar_bg   = data.get("avatar_bg", "b6e3f4"),
        last_visit  = datetime.utcnow(),
    )
    db.session.add(patient)
    db.session.commit()
    return jsonify(patient.to_dict()), 201


@patients_bp.get("/<int:patient_id>")
@login_required
def get_patient(patient_id):
    patient = _get_own_patient(patient_id)
    return jsonify(patient.to_dict()), 200


@patients_bp.put("/<int:patient_id>")
@login_required
def update_patient(patient_id):
    patient = _get_own_patient(patient_id)
    data    = request.get_json(silent=True) or {}

    for field in ("name", "age", "sex", "diagnosis", "status", "avatar_seed", "avatar_bg"):
        if field in data:
            setattr(patient, field, data[field])

    db.session.commit()
    return jsonify(patient.to_dict()), 200


@patients_bp.delete("/<int:patient_id>")
@login_required
def delete_patient(patient_id):
    patient = _get_own_patient(patient_id)
    db.session.delete(patient)
    db.session.commit()
    return jsonify({"message": "Patient deleted"}), 200


# ── Helper ───────────────────────────────────────────────────────────────────
def _get_own_patient(patient_id: int) -> Patient:
    patient = Patient.query.filter_by(id=patient_id, doctor_id=current_user.id).first()
    if not patient:
        from flask import abort
        abort(404, description="Patient not found")
    return patient
