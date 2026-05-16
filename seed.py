"""
seed.py – Populate the database with sample data matching the frontend.
Run once after db.create_all():
    python seed.py
"""
from app import create_app
from extensions import db, bcrypt
from models.user import User
from models.patient import Patient
from models.clinical import Appointment, Notification
from datetime import datetime, timedelta, timezone

app = create_app()

SAMPLE_PATIENTS = [
    {"name": "James Wilson",  "age": 54, "sex": "M", "diagnosis": "Hypertension",        "status": "AI Ready",  "avatar_seed": "james",  "avatar_bg": "c0aede"},
    {"name": "Maria Garcia",  "age": 47, "sex": "F", "diagnosis": "Cardiac Risk",         "status": "High Risk", "avatar_seed": "maria",  "avatar_bg": "ffdfbf"},
    {"name": "John Kim",      "age": 62, "sex": "M", "diagnosis": "Diabetes T2",          "status": "Pending",   "avatar_seed": "john",   "avatar_bg": "b6e3f4"},
    {"name": "Aisha Patel",   "age": 38, "sex": "F", "diagnosis": "Migraine",             "status": "AI Ready",  "avatar_seed": "aisha",  "avatar_bg": "d1d4f9"},
    {"name": "Robert Lee",    "age": 71, "sex": "M", "diagnosis": "COPD",                 "status": "In Review", "avatar_seed": "robert", "avatar_bg": "ffd5dc"},
    {"name": "Emily Chen",    "age": 29, "sex": "F", "diagnosis": "Anxiety",              "status": "Pending",   "avatar_seed": "emily",  "avatar_bg": "c0e8d5"},
    {"name": "David Park",    "age": 55, "sex": "M", "diagnosis": "Atrial Fibrillation",  "status": "AI Ready",  "avatar_seed": "david",  "avatar_bg": "ffd5e5"},
    {"name": "Fatima Hassan", "age": 43, "sex": "F", "diagnosis": "Hypothyroidism",       "status": "AI Ready",  "avatar_seed": "fatima", "avatar_bg": "ffe4c4"},
    {"name": "Carlos Ruiz",   "age": 67, "sex": "M", "diagnosis": "Heart Failure",        "status": "High Risk", "avatar_seed": "carlos", "avatar_bg": "b5d8ff"},
    {"name": "Linda Wang",    "age": 51, "sex": "F", "diagnosis": "Osteoporosis",         "status": "In Review", "avatar_seed": "linda",  "avatar_bg": "e8d5f5"},
]


def seed():
    with app.app_context():
        db.create_all()

        # Create doctor if doesn't exist
        doctor = User.query.filter_by(email="sarah.chen@medinotex.io").first()
        if not doctor:
            doctor = User(
                email         = "sarah.chen@medinotex.io",
                password_hash = bcrypt.generate_password_hash("MediNotex@2026").decode("utf-8"),
                full_name     = "Dr. Sarah Chen",
                specialty     = "Cardiologist · MD",
                avatar_seed   = "doctor",
            )
            db.session.add(doctor)
            db.session.flush()   # Get doctor.id before committing
            print(f"✅ Doctor created: {doctor.email}  (password: MediNotex@2026)")
        else:
            print(f"ℹ️  Doctor already exists: {doctor.email}")

        # Seed patients
        now = datetime.now(timezone.utc)
        for i, p in enumerate(SAMPLE_PATIENTS):
            existing = Patient.query.filter_by(name=p["name"], doctor_id=doctor.id).first()
            if existing:
                continue
            pat = Patient(
                doctor_id   = doctor.id,
                last_visit  = now - timedelta(days=i),
                notes_count = [12, 8, 15, 6, 20, 4, 9, 7, 18, 5][i],
                **p,
            )
            db.session.add(pat)

        db.session.flush()

        # Seed appointments
        patients = Patient.query.filter_by(doctor_id=doctor.id).all()
        if patients and Appointment.query.filter_by(doctor_id=doctor.id).count() == 0:
            for i, pat in enumerate(patients[:4]):
                appt = Appointment(
                    patient_id   = pat.id,
                    doctor_id    = doctor.id,
                    title        = f"Follow-up – {pat.diagnosis}",
                    visit_type   = "Follow-Up",
                    scheduled_at = now + timedelta(days=i + 1, hours=9),
                    duration_min = 30,
                    status       = "scheduled",
                )
                db.session.add(appt)

        # Seed notifications
        if Notification.query.filter_by(doctor_id=doctor.id).count() == 0:
            notifs = [
                Notification(doctor_id=doctor.id, type="success", title="AI Summary Ready",      message="Patient James Wilson note processed",          is_read=False),
                Notification(doctor_id=doctor.id, type="warning", title="High Risk Flag",        message="Patient Maria Garcia — cardiac risk elevated", is_read=False),
                Notification(doctor_id=doctor.id, type="info",    title="Appointment Reminder",  message="John Kim — tomorrow 9:00 AM",                 is_read=False),
            ]
            db.session.add_all(notifs)

        db.session.commit()
        print("✅ Database seeded successfully!")
        print("\n── Login credentials ──────────────────────────────────")
        print("   Email:    sarah.chen@medinotex.io")
        print("   Password: MediNotex@2026")
        print("───────────────────────────────────────────────────────\n")


if __name__ == "__main__":
    seed()
