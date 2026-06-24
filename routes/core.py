from flask import Blueprint, render_template

core_bp = Blueprint("core", __name__)

@core_bp.route("/")
def home():
    return render_template("doctor_dashboard.html")

@core_bp.route("/login")
def login_page():
    return render_template("login.html")