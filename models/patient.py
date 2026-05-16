from extensions import db
from datetime import datetime


class Patient(db.Model):
    """Patient record."""
    __tablename__ = "patients"

    id            = db.Column(db.Integer,     primary_key=True)
    doctor_id     = db.Column(db.Integer,     db.ForeignKey("users.id"), nullable=False, index=True)
    name          = db.Column(db.String(120), nullable=False)
    age           = db.Column(db.Integer,     nullable=True)
    sex           = db.Column(db.String(1),   nullable=True)           # M / F / O
    diagnosis     = db.Column(db.String(200), nullable=True)
    status        = db.Column(db.String(30),  default="Pending")       # AI Ready | High Risk | Pending | In Review
    avatar_seed   = db.Column(db.String(40),  nullable=True)
    avatar_bg     = db.Column(db.String(10),  nullable=True)
    notes_count   = db.Column(db.Integer,     default=0)
    last_visit    = db.Column(db.DateTime,    nullable=True)
    created_at    = db.Column(db.DateTime,    default=datetime.utcnow)

    # Relationships
    clinical_notes = db.relationship("ClinicalNote",  backref="patient", lazy="dynamic",  cascade="all, delete-orphan")
    summaries      = db.relationship("AISummary",     backref="patient", lazy="dynamic",  cascade="all, delete-orphan")
    appointments   = db.relationship("Appointment",   backref="patient", lazy="dynamic",  cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id":          self.id,
            "name":        self.name,
            "age":         self.age,
            "sex":         self.sex,
            "diagnosis":   self.diagnosis,
            "status":      self.status,
            "notes_count": self.notes_count,
            "last_visit":  self.last_visit.strftime("%b %d, %Y") if self.last_visit else None,
            "avatar_seed": self.avatar_seed,
            "avatar_bg":   self.avatar_bg,
        }

    def __repr__(self):
        return f"<Patient {self.name}>"
