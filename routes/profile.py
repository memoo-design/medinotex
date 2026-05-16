"""
Profile Routes
GET  /api/profile/     – get current doctor profile
PUT  /api/profile/     – update name, specialty, avatar
POST /api/profile/password – change password
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from extensions import db, bcrypt

profile_bp = Blueprint("profile", __name__)


@profile_bp.get("/")
@login_required
def get_profile():
    return jsonify(current_user.to_dict()), 200


@profile_bp.put("/")
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}

    if "full_name" in data and data["full_name"].strip():
        current_user.full_name = data["full_name"].strip()
    if "specialty" in data:
        current_user.specialty = data["specialty"].strip()
    if "avatar_seed" in data:
        current_user.avatar_seed = data["avatar_seed"].strip()

    db.session.commit()
    return jsonify({"message": "Profile updated", "user": current_user.to_dict()}), 200


@profile_bp.post("/password")
@login_required
def change_password():
    data        = request.get_json(silent=True) or {}
    current_pw  = data.get("current_password", "")
    new_pw      = data.get("new_password", "")

    if not bcrypt.check_password_hash(current_user.password_hash, current_pw):
        return jsonify({"error": "Current password is incorrect"}), 401
    if len(new_pw) < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 400

    current_user.password_hash = bcrypt.generate_password_hash(new_pw).decode("utf-8")
    db.session.commit()
    return jsonify({"message": "Password changed successfully"}), 200
