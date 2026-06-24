"""
Audit Log Routes
GET /api/audit/ – list audit entries for the logged-in doctor
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models.clinical import AuditLog

audit_bp = Blueprint("audit", __name__)


@audit_bp.get("/")
@login_required
def list_audit():
    page = int(request.args.get("page", 1))
    per  = int(request.args.get("per_page", 50))

    paginated = (
        AuditLog.query
        .filter_by(doctor_id=current_user.id)
        .order_by(AuditLog.created_at.desc())
        .paginate(page=page, per_page=per, error_out=False)
    )

    return jsonify({
        "entries": [e.to_dict() for e in paginated.items],
        "total":   paginated.total,
        "page":    paginated.page,
        "pages":   paginated.pages,
    }), 200
