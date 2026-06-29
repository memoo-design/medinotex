"""Paths and constants for Colab-exported model artifacts."""
from pathlib import Path

AI_MODELS_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = AI_MODELS_DIR / "models"

VECTORIZER_FILE = MODELS_DIR / "tfidf_vectorizer.joblib"
ICD_MODEL_FILE = MODELS_DIR / "rf_icd10.joblib"
CPT_MODEL_FILE = MODELS_DIR / "rf_cpt.joblib"
METADATA_FILE = MODELS_DIR / "metadata.json"

REQUIRED_ARTIFACTS = (
    VECTORIZER_FILE,
    ICD_MODEL_FILE,
    CPT_MODEL_FILE,
    METADATA_FILE,
)
