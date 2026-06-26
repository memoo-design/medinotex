from flask import Blueprint, render_template, redirect, url_for
from flask_login import current_user

core_bp = Blueprint("core", __name__)

def _dashboard_url_for_role(role):
    if role == "admin":
        return "/dashboard"  # or admin-dashboard when exists
    if role in ("medical_coder", "coder"):
        return "/coder"  # new route → medinotex_coder.html
    return "/dashboard"


@core_bp.route("/")
def home():
    return render_template("index.html")


@core_bp.route("/dashboard")
def doctor_dashboard():
    return render_template("doctor_dashboard.html")


@core_bp.route("/login")
def login_page():
    if current_user.is_authenticated:
        return redirect(_dashboard_url_for_role(current_user.role))
    return render_template("login.html")
