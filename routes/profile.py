"""
Profile Routes
GET    /api/profile/          – get current doctor profile
PUT    /api/profile/          – update profile fields
POST   /api/profile/password  – change password
POST   /api/profile/avatar    – upload profile picture
DELETE /api/profile/avatar    – remove profile picture
"""
import os
import uuid
from pathlib import Path

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename

from extensions import db, bcrypt

profile_bp = Blueprint("profile", __name__)

ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png"}
def _is_admin():
    return getattr(current_user, "role", None) == "admin"


def _is_coder():
    return getattr(current_user, "role", None) in ("medical_coder", "coder")




def _allowed_image(filename):
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def _avatar_dir():
    folder = current_app.config.get("PROFILE_PICTURE_FOLDER", os.path.join("static", "uploads", "avatars"))
    path = Path(current_app.root_path) / folder
    path.mkdir(parents=True, exist_ok=True)
    return path


def _delete_avatar_file(relative_path):
    if not relative_path:
        return
    full = Path(current_app.root_path) / relative_path.replace("/", os.sep)
    if full.is_file():
        try:
            full.unlink()
        except OSError:
            pass


@profile_bp.get("/")
@login_required
def get_profile():
    return jsonify(current_user.to_dict()), 200


@profile_bp.put("/")
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}

    if "full_name" in data:
        name = (data["full_name"] or "").strip()
        if not name:
            return jsonify({"error": "Full name cannot be empty"}), 400
        current_user.full_name = name

    if "email" in data:
        if _is_coder():
            return jsonify({"error": "Email cannot be changed from the coder profile"}), 403
        email = (data["email"] or "").strip().lower()
        if not email:
            return jsonify({"error": "Email cannot be empty"}), 400
        existing = type(current_user).query.filter(
            type(current_user).email == email,
            type(current_user).id != current_user.id,
        ).first()
        if existing:
            return jsonify({"error": "Email is already in use"}), 409
        current_user.email = email

    if "specialty" in data:
        if not _is_admin():
            return jsonify({"error": "Specialization can only be changed by an administrator"}), 403
        current_user.specialty = (data["specialty"] or "").strip() or None

    if "department" in data:
        if not _is_admin():
            return jsonify({"error": "Department can only be changed by an administrator"}), 403
        current_user.department = (data["department"] or "").strip() or None

    if "employee_id" in data:
        if not _is_admin():
            return jsonify({"error": "Employee ID can only be changed by an administrator"}), 403
        current_user.employee_id = (data["employee_id"] or "").strip() or None

    if "role" in data:
        if not _is_admin():
            return jsonify({"error": "Role can only be changed by an administrator"}), 403
        current_user.role = (data["role"] or "").strip() or current_user.role

    if "phone" in data:
        phone = (data["phone"] or "").strip()
        if phone and len(phone) > 30:
            return jsonify({"error": "Phone number is too long"}), 400
        current_user.phone = phone or None

    if "hospital_clinic" in data:
        if not _is_admin():
            return jsonify({"error": "Hospital name can only be changed by an administrator"}), 403
        current_user.hospital_clinic = (data["hospital_clinic"] or "").strip() or None

    if "address" in data:
        current_user.address = (data["address"] or "").strip() or None

    if "avatar_seed" in data:
        current_user.avatar_seed = (data["avatar_seed"] or "").strip() or "doctor"

    db.session.commit()
    return jsonify({"message": "Profile updated", "user": current_user.to_dict()}), 200

@profile_bp.post("/password")
@login_required
def change_password():
    data        = request.get_json(silent=True) or {}
    current_pw  = data.get("current_password", "")
    new_pw      = data.get("new_password", "")
    confirm_pw  = data.get("confirm_password", new_pw)

    if not current_pw:
        return jsonify({"error": "Current password is required"}), 400
    if not new_pw:
        return jsonify({"error": "New password is required"}), 400
    if new_pw != confirm_pw:
        return jsonify({"error": "New passwords do not match"}), 400
    if not bcrypt.check_password_hash(current_user.password_hash, current_pw):
        return jsonify({"error": "Current password is incorrect"}), 401
    if len(new_pw) < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 400

    current_user.password_hash = bcrypt.generate_password_hash(new_pw).decode("utf-8")
    db.session.commit()
    return jsonify({"message": "Password changed successfully"}), 200


@profile_bp.post("/avatar")
@login_required
def upload_avatar():
    file = request.files.get("profile_picture")
    if not file or not file.filename:
        return jsonify({"error": "No image file provided"}), 400

    if not _allowed_image(file.filename):
        return jsonify({"error": "Invalid image format. Allowed: JPG, JPEG, PNG"}), 400

    ext = file.filename.rsplit(".", 1)[1].lower()
    safe_name = secure_filename(f"user_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}")
    avatar_path = _avatar_dir() / safe_name

    _delete_avatar_file(current_user.profile_picture)
    file.save(str(avatar_path))

    relative = str(Path(current_app.config.get("PROFILE_PICTURE_FOLDER", "static/uploads/avatars")) / safe_name).replace("\\", "/")
    current_user.profile_picture = relative
    db.session.commit()

    return jsonify({
        "message": "Profile picture uploaded",
        "user": current_user.to_dict(),
    }), 200


@profile_bp.delete("/avatar")
@login_required
def remove_avatar():
    if not current_user.profile_picture:
        return jsonify({"error": "No profile picture to remove"}), 404

    _delete_avatar_file(current_user.profile_picture)
    current_user.profile_picture = None
    db.session.commit()

    return jsonify({
        "message": "Profile picture removed",
        "user": current_user.to_dict(),
    }), 200
