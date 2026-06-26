"""Lightweight schema upgrades for dev SQLite / PostgreSQL without Alembic."""
from sqlalchemy import inspect, text
from extensions import db


TABLE_COLUMNS = {
    "users": {
        "last_login": "TIMESTAMP",
        "phone": "VARCHAR(30)",
        "hospital_clinic": "VARCHAR(150)",
        "department": "VARCHAR(100)",
        "employee_id": "VARCHAR(50)",
        "address": "TEXT",
        "profile_picture": "VARCHAR(255)",
    },
    "clinical_notes": {
        "status": "VARCHAR(30) DEFAULT 'uploaded'",
    },
    "ai_summaries": {
        "workflow_status":     "VARCHAR(40) DEFAULT 'doctor_review'",
        "coder_return_reason": "TEXT",
        "ai_confidence":       "INTEGER",
        "submitted_at":        "TIMESTAMP",
        "updated_at":          "TIMESTAMP",
    },
}


def _add_column(table: str, col: str, col_type: str, dialect: str):
    if dialect == "sqlite":
        ddl = f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"
    else:
        ddl = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type}"
    db.session.execute(text(ddl))


def ensure_schema():
    """Add missing columns / tables after db.create_all()."""
    db.create_all()

    insp = inspect(db.engine)
    dialect = db.engine.dialect.name
    tables = insp.get_table_names()

    for table, columns in TABLE_COLUMNS.items():
        if table not in tables:
            continue
        existing = {c["name"] for c in insp.get_columns(table)}
        for col, col_type in columns.items():
            if col not in existing:
                _add_column(table, col, col_type, dialect)

    db.session.commit()
