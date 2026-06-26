"""
Medical coder routes.

GET  /api/coder/queue
GET  /api/coder/notes/<note_id>
GET  /api/coder/notes/<note_id>/suggestions
POST /api/coder/notes/<note_id>/approve

Legacy (kept for compatibility):
GET  /api/coder/pending-reviews
GET  /api/coder/ai-suggestions
POST /api/coder/reviews/<summary_id>/approve
POST /api/coder/reviews/<summary_id>/draft
"""
import json
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from extensions import db
from models.clinical import (
    AISummary,
    ClinicalNote,
    CodeSuggestion,
    CoderReview,
    WORKFLOW_SUBMITTED_TO_CODER,
    WORKFLOW_PENDING_REVIEW,
    WORKFLOW_APPROVED,
    WORKFLOW_CODER_REVIEW,
    NOTE_STATUS_SUBMITTED,
    NOTE_STATUS_PENDING,
    NOTE_STATUS_APPROVED,
)
from services.coding_service import (
    suggest_codes,
    summary_has_ai_content,
    clinical_text_for_coding,
    original_note_text,
    build_highlighted_html,
    persist_suggestion,
)
from services.audit import log_audit
from utils.decorators import role_required

coder_bp = Blueprint("coder", __name__)

CODER_ROLES = ("medical_coder", "coder")
QUEUE_STATUSES = (WORKFLOW_SUBMITTED_TO_CODER, WORKFLOW_PENDING_REVIEW)


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


def _get_note_for_coder(note_id: int) -> ClinicalNote | None:
    return ClinicalNote.query.get(note_id)


def _queue_summaries():
    return (
        AISummary.query
        .filter(AISummary.workflow_status.in_(QUEUE_STATUSES))
        .order_by(AISummary.submitted_at.desc().nullslast(), AISummary.created_at.desc())
        .all()
    )


def _queue_item(summary: AISummary) -> dict:
    note = summary.note
    has_ai = summary_has_ai_content(summary)
    doctor = summary.doctor
    preview = original_note_text(note) if note else ""
    if not preview:
        preview = clinical_text_for_coding(note, summary)

    return {
        "note_id": note.id if note else None,
        "summary_id": summary.id,
        "doctor_name": doctor.full_name if doctor else "Unknown",
        "patient_name": summary.patient.name if summary.patient else "Unknown",
        "submitted_at": (summary.submitted_at or summary.created_at).isoformat(),
        "has_ai_summary": has_ai,
        "summary_status": "Available" if has_ai else "Not available",
        "original_preview": (preview[:300] + "…") if len(preview) > 300 else preview,
        "status": summary.workflow_status,
        "note_status": note.status if note else None,
        # Legacy keys for existing pending list UI
        "id": str(note.id if note else summary.id),
        "pt": summary.patient.name if summary.patient else "Unknown",
        "prio": "High" if not has_ai else "Medium",
        "type": "SOAP Review" if has_ai else "Original Note",
        "assigned": _format_age(summary.submitted_at or summary.created_at),
        "age": _format_age(summary.submitted_at or summary.created_at),
        "original_text": preview[:800] if preview else "",
        "assessment": summary.assessment,
        "subjective": summary.subjective,
    }


def _note_detail(note: ClinicalNote) -> dict:
    summary = note.summary
    has_ai = summary_has_ai_content(summary) if summary else False
    orig = original_note_text(note)
    suggestions = CodeSuggestion.query.filter_by(note_id=note.id).first()

    payload = {
        "note_id": note.id,
        "summary_id": summary.id if summary else None,
        "status": summary.workflow_status if summary else note.status,
        "note_status": note.status,
        "visit_type": note.visit_type,
        "doctor": {
            "id": note.doctor_id,
            "name": note.doctor.full_name if note.doctor else "Unknown",
            "specialty": note.doctor.specialty if note.doctor else None,
        },
        "patient": {
            "id": note.patient_id,
            "name": note.patient.name if note.patient else "Unknown",
        },
        "submitted_at": (
            summary.submitted_at.isoformat()
            if summary and summary.submitted_at
            else note.created_at.isoformat()
        ),
        "has_ai_summary": has_ai,
        "original_text": orig,
        "extracted_text": (note.ocr_text or "").strip() or None,
        "raw_text": (note.raw_text or "").strip() or None,
        "soap": {
            "subjective": summary.subjective if summary else None,
            "objective": summary.objective if summary else None,
            "assessment": summary.assessment if summary else None,
            "plan": summary.plan if summary else None,
        } if summary else None,
        "saved_suggestions": suggestions.to_dict() if suggestions else None,
    }
    return payload


# ── Primary workflow APIs ─────────────────────────────────────────────────────

@coder_bp.get("/queue")
@login_required
@role_required(*CODER_ROLES)
def coder_queue():
    rows = _queue_summaries()
    return jsonify({
        "queue": [_queue_item(s) for s in rows],
        "count": len(rows),
    }), 200


@coder_bp.get("/notes/<int:note_id>")
@login_required
@role_required(*CODER_ROLES)
def get_coder_note(note_id):
    note = _get_note_for_coder(note_id)
    if not note:
        return jsonify({"error": "Clinical note not found"}), 404

    summary = note.summary
    if not summary:
        return jsonify({"error": "Note has not been submitted for coding"}), 404
    if summary.workflow_status not in QUEUE_STATUSES + (WORKFLOW_APPROVED, WORKFLOW_CODER_REVIEW):
        return jsonify({"error": "Note is not in the coding queue"}), 409

    # Mark as pending review when coder opens the case
    if summary and summary.workflow_status == WORKFLOW_SUBMITTED_TO_CODER:
        summary.workflow_status = WORKFLOW_PENDING_REVIEW
        note.status = NOTE_STATUS_PENDING
        summary.add_history("Opened by medical coder for review")
        db.session.commit()

    detail = _note_detail(note)
    highlights = []
    if detail.get("saved_suggestions"):
        highlights = detail["saved_suggestions"].get("highlighted_terms", [])
    display_text = orig = original_note_text(note) or clinical_text_for_coding(note, summary)
    detail["highlighted_html"] = build_highlighted_html(display_text, highlights)
    return jsonify(detail), 200


@coder_bp.get("/notes/<int:note_id>/suggestions")
@login_required
@role_required(*CODER_ROLES)
def get_coder_suggestions(note_id):
    note = _get_note_for_coder(note_id)
    if not note:
        return jsonify({"error": "Clinical note not found"}), 404

    summary = note.summary
    if not summary or summary.workflow_status not in QUEUE_STATUSES:
        return jsonify({"error": "Note is not in the coding queue"}), 409

    existing = CodeSuggestion.query.filter_by(note_id=note_id).first()
    if existing:
        data = existing.to_dict()
        data["highlighted_html"] = build_highlighted_html(
            original_note_text(note) or clinical_text_for_coding(note, summary),
            data.get("highlighted_terms", []),
        )
        return jsonify(data), 200

    payload = suggest_codes(note, summary)
    row = persist_suggestion(db.session, note_id, payload)
    db.session.commit()

    data = row.to_dict()
    data["highlighted_html"] = build_highlighted_html(
        original_note_text(note) or clinical_text_for_coding(note, summary),
        data.get("highlighted_terms", []),
    )
    return jsonify(data), 200


def _approve_note_internal(note: ClinicalNote, icd_codes: list, cpt_codes: list, comments: str | None):
    summary = note.summary
    if not summary or summary.workflow_status not in QUEUE_STATUSES:
        return None, (jsonify({"error": "Note is not available for approval"}), 409)

    now = datetime.utcnow()
    review = CoderReview(
        note_id=note.id,
        coder_id=current_user.id,
        final_icd_codes=json.dumps(icd_codes),
        final_cpt_codes=json.dumps(cpt_codes),
        comments=comments,
        approved=True,
        approved_at=now,
    )
    db.session.add(review)

    summary.workflow_status = WORKFLOW_APPROVED
    summary.add_history(
        f"Coding approved by {current_user.full_name}"
        + (f" — {comments}" if comments else "")
    )
    note.status = NOTE_STATUS_APPROVED
    note.processed = True

    if note.patient:
        note.patient.status = "Coded"

    log_audit(
        current_user.id,
        "coder_approved",
        "clinical_note",
        note.id,
        {"icd": [c["code"] for c in icd_codes], "cpt": [c["code"] for c in cpt_codes]},
    )
    db.session.commit()
    return review, None


def _normalize_code_entries(entries):
    out = []
    for e in entries or []:
        if isinstance(e, str):
            out.append({"code": e.strip(), "description": "", "mapped_text": ""})
        elif isinstance(e, dict) and e.get("code"):
            out.append({
                "code": str(e["code"]).strip(),
                "description": e.get("description", ""),
                "mapped_text": e.get("mapped_text", ""),
            })
    return out


@coder_bp.post("/notes/<int:note_id>/approve")
@login_required
@role_required(*CODER_ROLES)
def approve_coder_note(note_id):
    note = _get_note_for_coder(note_id)
    if not note:
        return jsonify({"error": "Clinical note not found"}), 404

    data = request.get_json(silent=True) or {}
    icd_codes = _normalize_code_entries(data.get("final_icd_codes") or data.get("icd_codes"))
    cpt_codes = _normalize_code_entries(data.get("final_cpt_codes") or data.get("cpt_codes"))
    comments = (data.get("comments") or "").strip() or None

    if not icd_codes:
        return jsonify({"error": "At least one ICD code is required"}), 400

    review, err = _approve_note_internal(note, icd_codes, cpt_codes, comments)
    if err:
        return err

    summary = note.summary
    return jsonify({
        "message": "Coding approved successfully",
        "review": review.to_dict(),
        "note_status": note.status,
        "workflow_status": summary.workflow_status if summary else None,
    }), 200


# ── Legacy endpoints (backward compatible) ────────────────────────────────────

def _review_item(summary: AISummary) -> dict:
    item = _queue_item(summary)
    codes = suggest_codes(summary.note, summary) if summary.note else {"icd": [], "cpt": []}
    code_parts = [c["code"] for c in codes.get("icd_codes", codes.get("icd", []))[:3]]
    code_parts += [c["code"] for c in codes.get("cpt_codes", codes.get("cpt", []))[:2]]
    item["codes"] = ", ".join(code_parts) if code_parts else "Pending"
    return item


@coder_bp.get("/pending-reviews")
@login_required
@role_required(*CODER_ROLES)
def pending_reviews():
    rows = _queue_summaries()
    return jsonify({"reviews": [_review_item(s) for s in rows]}), 200


@coder_bp.get("/ai-suggestions")
@login_required
@role_required(*CODER_ROLES)
def ai_suggestions():
    rows = _queue_summaries()[:20]
    suggestions = []
    for s in rows:
        note = s.note
        codes = suggest_codes(note, s)
        suggestions.append({
            "case_id": str(s.id),
            "note_id": note.id if note else None,
            "patient": s.patient.name if s.patient else "Unknown",
            "has_ai_summary": summary_has_ai_content(s),
            "icd": codes.get("icd_codes", codes.get("icd", [])),
            "cpt": codes.get("cpt_codes", codes.get("cpt", [])),
            "confidence": codes.get("confidence"),
            "method": codes.get("method"),
        })
    return jsonify({"suggestions": suggestions}), 200


@coder_bp.post("/reviews/<int:summary_id>/approve")
@login_required
@role_required(*CODER_ROLES)
def approve_review(summary_id):
    """Legacy approve by summary id — delegates to note-based approve when possible."""
    summary = AISummary.query.get(summary_id)
    if not summary:
        return jsonify({"error": "Review not found"}), 404
    if summary.workflow_status not in QUEUE_STATUSES:
        return jsonify({"error": "Review is not in pending state"}), 409

    note = summary.note
    if note:
        data = request.get_json(silent=True) or {}
        override = data.get("override_codes")
        if override:
            icd = [{"code": c.strip()} for c in override.split(",") if c.strip()]
            cpt = []
        else:
            icd = _normalize_code_entries(data.get("final_icd_codes"))
            cpt = _normalize_code_entries(data.get("final_cpt_codes"))
            if not icd:
                codes = suggest_codes(note, summary)
                icd = _normalize_code_entries(codes.get("icd_codes", codes.get("icd", [])))
                cpt = _normalize_code_entries(codes.get("cpt_codes", codes.get("cpt", [])))
        review, err = _approve_note_internal(note, icd, cpt, data.get("comments"))
        if err:
            return err
        return jsonify({
            "message": "Review approved",
            "review": review.to_dict(),
            "summary": summary.to_dict(),
        }), 200

    summary.workflow_status = WORKFLOW_CODER_REVIEW
    summary.add_history("Approved by medical coder")
    log_audit(current_user.id, "coder_approved", "ai_summary", summary.id)
    db.session.commit()
    return jsonify({"message": "Review approved", "summary": summary.to_dict()}), 200


@coder_bp.post("/reviews/<int:summary_id>/draft")
@login_required
@role_required(*CODER_ROLES)
def draft_review(summary_id):
    summary = AISummary.query.get(summary_id)
    if not summary:
        return jsonify({"error": "Review not found"}), 404

    data = request.get_json(silent=True) or {}
    summary.add_history(
        "Coder saved draft"
        + (f": {data.get('draft_codes', '')}" if data.get("draft_codes") else "")
    )
    db.session.commit()
    return jsonify({"message": "Draft saved"}), 200
