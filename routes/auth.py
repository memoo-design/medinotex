"""
Authentication Routes
POST /auth/register  – create doctor account
POST /auth/login     – session login
POST /auth/logout    – end session
GET  /auth/me        – return logged-in user info
"""
from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user
from datetime import datetime, timezone

from extensions import db, bcrypt
from models.user import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email     = (data.get("email") or "").strip().lower()
    password  = data.get("password", "")
    full_name = (data.get("full_name") or "").strip()
    specialty = (data.get("specialty") or "").strip()

    if not email or not password or not full_name:
        return jsonify({"error": "email, password and full_name are required"}), 400

    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    hashed = bcrypt.generate_password_hash(password).decode("utf-8")
    user   = User(email=email, password_hash=hashed, full_name=full_name, specialty=specialty)
    db.session.add(user)
    db.session.commit()

    login_user(user, remember=True)
    session.permanent = True

    return jsonify({"message": "Account created", "user": user.to_dict()}), 201


@auth_bp.post("/login")
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password"}), 401

    if not user.is_active:
        return jsonify({"error": "Account is disabled"}), 403

    user.last_login = datetime.now(timezone.utc)
    db.session.commit()

    login_user(user, remember=data.get("remember", False))
    session.permanent = True

    return jsonify({"message": "Login successful", "user": user.to_dict()}), 200


@auth_bp.post("/logout")
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out"}), 200


@auth_bp.get("/me")
@login_required
def me():
    return jsonify(current_user.to_dict()), 200
