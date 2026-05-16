"""
MediNotex – Configuration
All secrets should be set via environment variables (.env file in dev).
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    # ── Flask ─────────────────────────────────────────────────────────────────
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
    DEBUG      = os.getenv("FLASK_DEBUG", "false").lower() == "true"

    # ── Database (PostgreSQL recommended for production) ──────────────────────
    SQLALCHEMY_DATABASE_URI     = os.getenv("DATABASE_URL", "sqlite:///medinotex.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Session ───────────────────────────────────────────────────────────────
    PERMANENT_SESSION_LIFETIME  = timedelta(hours=8)
    SESSION_COOKIE_HTTPONLY     = True
    SESSION_COOKIE_SAMESITE     = "Lax"

    # ── Azure Blob Storage ────────────────────────────────────────────────────
    AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
    AZURE_BLOB_CONTAINER            = os.getenv("AZURE_BLOB_CONTAINER", "clinical-notes")

    # ── Azure AI Language Service ─────────────────────────────────────────────
    AZURE_LANGUAGE_ENDPOINT = os.getenv("AZURE_LANGUAGE_ENDPOINT", "")
    AZURE_LANGUAGE_KEY      = os.getenv("AZURE_LANGUAGE_KEY", "")

    # ── Azure Document Intelligence (Form Recognizer) ─────────────────────────
    AZURE_FORM_RECOGNIZER_ENDPOINT = os.getenv("AZURE_FORM_RECOGNIZER_ENDPOINT", "")
    AZURE_FORM_RECOGNIZER_KEY      = os.getenv("AZURE_FORM_RECOGNIZER_KEY", "")

    # ── File Upload Limits ────────────────────────────────────────────────────
    MAX_CONTENT_LENGTH          = 16 * 1024 * 1024   # 16 MB
    ALLOWED_EXTENSIONS          = {"pdf", "docx", "txt"}

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
