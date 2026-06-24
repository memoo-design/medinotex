"""Audit logging helper — records doctor actions to the audit_logs table."""
import json
from extensions import db
from models.clinical import AuditLog


def log_audit(doctor_id: int, action: str, entity_type: str = None,
              entity_id: int = None, details: dict = None):
    entry = AuditLog(
        doctor_id   = doctor_id,
        action      = action,
        entity_type = entity_type,
        entity_id   = entity_id,
        details     = json.dumps(details) if details else None,
    )
    db.session.add(entry)
    return entry
