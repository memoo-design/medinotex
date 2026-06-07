"""
MediNoteX – Flask Backend Entry Point
"""

from flask import Flask
from flask_cors import CORS
from flask_login import LoginManager

from extensions import db, migrate, bcrypt
from config import Config

login_manager = LoginManager()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # ── Extensions ─────────────────────────────────────────
    db.init_app(app)
    migrate.init_app(app, db)
    bcrypt.init_app(app)
    CORS(app, supports_credentials=True)

    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.session_protection = "strong"

    # ── Blueprints ─────────────────────────────────────────
    from routes.auth import auth_bp
    from routes.patients import patients_bp
    from routes.upload import upload_bp
    from routes.summaries import summaries_bp
    from routes.appointments import appointments_bp
    from routes.notifications import notifications_bp
    from routes.dashboard import dashboard_bp
    from routes.profile import profile_bp
    from routes.core import core_bp   # 👈 added (for / route)

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(patients_bp, url_prefix="/api/patients")
    app.register_blueprint(upload_bp, url_prefix="/api/upload")
    app.register_blueprint(summaries_bp, url_prefix="/api/summaries")
    app.register_blueprint(appointments_bp, url_prefix="/api/appointments")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(profile_bp, url_prefix="/api/profile")
    app.register_blueprint(core_bp)   # 👈 no prefix, handles "/"

    return app


# ── Flask-Login user loader ───────────────────────────────
@login_manager.user_loader
def load_user(user_id):
    from models.user import User
    return User.query.get(int(user_id))


# ── Run directly (development only) ───────────────────────
if __name__ == "__main__":
    app = create_app()

    with app.app_context():
        db.create_all()

    app.run(debug=True, host="0.0.0.0", port=5000)