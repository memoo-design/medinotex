"""
Medical coder routes.
GET  /api/coder/pending-reviews
GET  /api/coder/ai-suggestions
POST /api/coder/reviews/<id>/approve
POST /api/coder/reviews/<id>/draft
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from extensions import db
from models.clinical import AISummary, WORKFLOW_SUBMITTED_TO_CODER, WORKFLOW_CODER_REVIEW
from services.coding_service import suggest_codes, summary_has_ai_content, clinical_text_for_coding
from services.audit import log_audit
from utils.decorators import role_required

coder_bp = Blueprint("coder", __name__)


def _format_age(dt):
    if not dt:
        return "—"
    now = datetime.now(timezone.utc)
    submitted = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    hours = max(0, int((now - submitted).total_seconds() // 3600))
    if hours < 1:
        return "<1h"
    if hours < 24:
        return f"{hours}h"
    return f"{hours // 24}d"


def _review_item(summary: AISummary) -> dict:
    note = summary.note
    has_ai = summary_has_ai_content(summary)
    codes = suggest_codes(note, summary) if note else {"icd": [], "cpt": []}
    code_parts = [c["code"] for c in codes.get("icd", [])[:3]]
    code_parts += [c["code"] for c in codes.get("cpt", [])[:2]]
    text = clinical_text_for_coding(note, summary) if note else ""

    return {
        "id": str(summary.id),
        "pt": summary.patient.name if summary.patient else "Unknown",
        "prio": "High" if not has_ai else "Medium",
        "type": "SOAP Review" if has_ai else "Original Note",
        "codes": ", ".join(code_parts) if code_parts else "Pending",
        "assigned": _format_age(summary.submitted_at or summary.created_at),
        "age": _format_age(summary.submitted_at or summary.created_at),
        "has_ai_summary": has_ai,
        "original_text": text[:800] if text else "",
        "subjective": summary.subjective,
        "assessment": summary.assessment,
    }


@coder_bp.get("/pending-reviews")
@login_required
@role_required("medical_coder", "coder", "admin")
def pending_reviews():
    rows = (
        AISummary.query
        .filter_by(workflow_status=WORKFLOW_SUBMITTED_TO_CODER)
        .order_by(AISummary.submitted_at.desc().nullslast(), AISummary.created_at.desc())
        .all()
    )
    return jsonify({"reviews": [_review_item(s) for s in rows]}), 200


@coder_bp.get("/ai-suggestions")
@login_required
@role_required("medical_coder", "coder", "admin")
def ai_suggestions():
    rows = (
        AISummary.query
        .filter_by(workflow_status=WORKFLOW_SUBMITTED_TO_CODER)
        .order_by(AISummary.submitted_at.desc().nullslast())
        .limit(20)
        .all()
    )
    suggestions = []
    for s in rows:
        note = s.note
        codes = suggest_codes(note, s)
        suggestions.append({
            "case_id": str(s.id),
            "patient": s.patient.name if s.patient else "Unknown",
            "has_ai_summary": summary_has_ai_content(s),
            "icd": codes.get("icd", []),
            "cpt": codes.get("cpt", []),
        })
    return jsonify({"suggestions": suggestions}), 200


@coder_bp.post("/reviews/<int:summary_id>/approve")
@login_required
@role_required("medical_coder", "coder", "admin")
def approve_review(summary_id):
    summary = AISummary.query.get(summary_id)
    if not summary:
        return jsonify({"error": "Review not found"}), 404
    if summary.workflow_status != WORKFLOW_SUBMITTED_TO_CODER:
        return jsonify({"error": "Review is not in pending state"}), 409

    summary.workflow_status = WORKFLOW_CODER_REVIEW
    summary.add_history("Approved by medical coder")
    log_audit(current_user.id, "coder_approved", "ai_summary", summary.id)
    db.session.commit()
    return jsonify({"message": "Review approved", "summary": summary.to_dict()}), 200


@coder_bp.post("/reviews/<int:summary_id>/draft")
@login_required
@role_required("medical_coder", "coder", "admin")
def draft_review(summary_id):
    summary = AISummary.query.get(summary_id)
    if not summary:
        return jsonify({"error": "Review not found"}), 404

    data = request.get_json(silent=True) or {}
    summary.add_history("Coder saved draft" + (f": {data.get('draft_codes', '')}" if data.get("draft_codes") else ""))
    db.session.commit()
    return jsonify({"message": "Draft saved"}), 200
