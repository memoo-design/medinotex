from flask_login import UserMixin
from extensions import db
from datetime import datetime


class User(db.Model, UserMixin):
    """Doctor / clinical user account."""
    __tablename__ = "users"

    id            = db.Column(db.Integer,     primary_key=True)
    email         = db.Column(db.String(150), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name     = db.Column(db.String(120), nullable=False)
    specialty     = db.Column(db.String(80),  nullable=True)
    phone         = db.Column(db.String(30),  nullable=True)
    hospital_clinic = db.Column(db.String(150), nullable=True)
    department      = db.Column(db.String(100), nullable=True)
    employee_id     = db.Column(db.String(50),  nullable=True)
    address       = db.Column(db.Text,        nullable=True)
    profile_picture = db.Column(db.String(255), nullable=True)
    role          = db.Column(db.String(20),  default="doctor")   # admin | doctor | medical_coder
    avatar_seed   = db.Column(db.String(40),  default="doctor")
    is_active     = db.Column(db.Boolean,     default=True)
    created_at    = db.Column(db.DateTime,    default=datetime.utcnow)
    last_login    = db.Column(db.DateTime,    nullable=True)

    # Relationships
    patients      = db.relationship("Patient",     backref="doctor", lazy="dynamic")
    summaries     = db.relationship("AISummary",   backref="doctor", lazy="dynamic")
    appointments  = db.relationship("Appointment", backref="doctor", lazy="dynamic")
    notifications = db.relationship("Notification",backref="doctor", lazy="dynamic")

    def to_dict(self):
        return {
            "id":              self.id,
            "email":           self.email,
            "full_name":       self.full_name,
            "specialty":       self.specialty,
            "phone":           self.phone,
            "hospital_clinic": self.hospital_clinic,
            "department":      self.department,
            "employee_id":     self.employee_id,
            "address":         self.address,
            "profile_picture": self.profile_picture,
            "role":            self.role,
            "avatar_seed":     self.avatar_seed,
            "created_at":      self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<User {self.email}>"
