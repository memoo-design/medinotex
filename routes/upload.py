"""
Upload Routes
GET  /api/upload/           – list clinical notes for this doctor
POST /api/upload/file       – upload PDF/DOCX/TXT to Azure Blob Storage
POST /api/upload/text       – submit typed clinical note text
GET  /api/upload/<id>       – get note details + SAS download URL
DELETE /api/upload/<id>     – delete note + blob
"""
import io
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from datetime import datetime

from extensions import db
from models.clinical import ClinicalNote
from models.patient import Patient
from services.blob_storage import upload_file_to_blob, generate_sas_url, delete_blob
from services.document_intelligence import extract_text_from_document
from services.audit import log_audit

upload_bp = Blueprint("upload", __name__)

ALLOWED = {"pdf", "docx", "txt"}

CONTENT_TYPES = {
    "pdf":  "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt":  "text/plain",
}


@upload_bp.get("/")
@login_required
def list_notes():
    """List clinical notes for the logged-in doctor."""
    page       = int(request.args.get("page", 1))
    per        = int(request.args.get("per_page", 20))
    patient_id = request.args.get("patient_id")
    processed  = request.args.get("processed")

    query = ClinicalNote.query.filter_by(doctor_id=current_user.id)

    if patient_id:
        query = query.filter_by(patient_id=int(patient_id))
    if processed is not None:
        query = query.filter_by(processed=processed.lower() in ("true", "1", "yes"))

    paginated = (
        query
        .order_by(ClinicalNote.created_at.desc())
        .paginate(page=page, per_page=per, error_out=False)
    )

    notes = []
    for note in paginated.items:
        data = note.to_dict()
        data["patient_name"] = note.patient.name if note.patient else None
        data["has_summary"] = note.summary is not None
        if note.summary:
            data["summary_id"] = note.summary.id
            data["workflow_status"] = note.summary.workflow_status
        notes.append(data)

    return jsonify({
        "notes": notes,
        "total": paginated.total,
        "page":  paginated.page,
        "pages": paginated.pages,
    }), 200


@upload_bp.post("/file")
@login_required
def upload_file():
    """
    Multipart form upload.
    Fields: patient_id, visit_type, use_soap, use_diagnosis, use_treatment, use_risk, model
    File:   clinical_file
    """
    if "clinical_file" not in request.files:
        return jsonify({"error": "No file attached (field: clinical_file)"}), 400

    file = request.files["clinical_file"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED:
        return jsonify({"error": f"File type '.{ext}' not allowed. Accepted: pdf, docx, txt"}), 415

    patient_id = request.form.get("patient_id")
    if not patient_id:
        return jsonify({"error": "patient_id is required"}), 400

    # Verify patient belongs to this doctor
    patient = Patient.query.filter_by(id=int(patient_id), doctor_id=current_user.id).first()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    # ── Azure Blob upload ──────────────────────────────────────────────────
    file_bytes = file.read()
    blob_info  = upload_file_to_blob(
        io.BytesIO(file_bytes),
        original_filename=file.filename,
        content_type=CONTENT_TYPES.get(ext, "application/octet-stream"),
    )

    # ── Azure Document Intelligence OCR ───────────────────────────────────
    ocr_text = extract_text_from_document(
        file_stream=io.BytesIO(file_bytes),
        blob_url=blob_info["blob_url"],
    )

    # ── Save to DB ─────────────────────────────────────────────────────────
    note = ClinicalNote(
        patient_id    = int(patient_id),
        doctor_id     = current_user.id,
        visit_type    = request.form.get("visit_type", "Initial Consultation"),
        source_type   = "file",
        file_name     = blob_info["file_name"],
        blob_url      = blob_info["blob_url"],
        blob_name     = blob_info["blob_name"],
        ocr_text      = ocr_text,
        raw_text      = ocr_text,         # raw_text used by AI service
        use_soap      = _bool(request.form.get("use_soap",      "true")),
        use_diagnosis = _bool(request.form.get("use_diagnosis", "true")),
        use_treatment = _bool(request.form.get("use_treatment", "true")),
        use_risk      = _bool(request.form.get("use_risk",      "false")),
        model_choice  = request.form.get("model", "MediAI Pro"),
    )
    db.session.add(note)

    # Update patient stats
    patient.notes_count = (patient.notes_count or 0) + 1
    patient.last_visit  = datetime.utcnow()

    db.session.commit()

    log_audit(current_user.id, "note_uploaded", "clinical_note", note.id,
              {"source_type": "file", "patient_id": note.patient_id})

    return jsonify({
        "message":   "File uploaded and text extracted",
        "note":      note.to_dict(),
        "ocr_chars": len(ocr_text) if ocr_text else 0,
    }), 201


@upload_bp.post("/text")
@login_required
def upload_text():
    """
    Submit a typed clinical note (no file).
    JSON: { patient_id, visit_type, text, use_soap, use_diagnosis, use_treatment, use_risk, model }
    """
    data = request.get_json(silent=True) or {}
    patient_id = data.get("patient_id")
    text       = (data.get("text") or "").strip()

    if not patient_id:
        return jsonify({"error": "patient_id is required"}), 400
    if not text:
        return jsonify({"error": "text is required"}), 400
    if len(text) < 10:
        return jsonify({"error": "Note text is too short (min 10 characters)"}), 400

    patient = Patient.query.filter_by(id=int(patient_id), doctor_id=current_user.id).first()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    note = ClinicalNote(
        patient_id    = int(patient_id),
        doctor_id     = current_user.id,
        visit_type    = data.get("visit_type", "Initial Consultation"),
        source_type   = "text",
        raw_text      = text,
        use_soap      = data.get("use_soap",      True),
        use_diagnosis = data.get("use_diagnosis", True),
        use_treatment = data.get("use_treatment", True),
        use_risk      = data.get("use_risk",      False),
        model_choice  = data.get("model",         "MediAI Pro"),
    )
    db.session.add(note)

    patient.notes_count = (patient.notes_count or 0) + 1
    patient.last_visit  = datetime.utcnow()

    db.session.commit()

    log_audit(current_user.id, "note_uploaded", "clinical_note", note.id,
              {"source_type": "text", "patient_id": note.patient_id})

    return jsonify({"message": "Note saved", "note": note.to_dict()}), 201


@upload_bp.get("/<int:note_id>")
@login_required
def get_note(note_id):
    note = _get_own_note(note_id)
    data = note.to_dict()
    # Generate short-lived SAS URL for secure download
    if note.blob_name:
        try:
            data["download_url"] = generate_sas_url(note.blob_name, expiry_hours=1)
        except Exception:
            data["download_url"] = note.blob_url
    return jsonify(data), 200


@upload_bp.delete("/<int:note_id>")
@login_required
def delete_note(note_id):
    note = _get_own_note(note_id)
    if note.blob_name:
        delete_blob(note.blob_name)
    db.session.delete(note)
    db.session.commit()
    return jsonify({"message": "Note deleted"}), 200


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_own_note(note_id: int) -> ClinicalNote:
    note = ClinicalNote.query.filter_by(id=note_id, doctor_id=current_user.id).first()
    if not note:
        from flask import abort
        abort(404, description="Note not found")
    return note


def _bool(val) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).lower() in ("true", "1", "yes")
