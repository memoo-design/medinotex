"""
Load Colab-trained Random Forest models and predict ICD-10 / CPT codes.

Training notebook: raw clinical_note -> TfidfVectorizer(stop_words='english') -> RF.
No extra preprocessing is applied at inference time.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer

from ai_models.src.config import (
    CPT_MODEL_FILE,
    ICD_MODEL_FILE,
    METADATA_FILE,
    MODELS_DIR,
    REQUIRED_ARTIFACTS,
    VECTORIZER_FILE,
)

logger = logging.getLogger(__name__)


class ModelArtifactsError(RuntimeError):
    """Raised when required Colab export files are missing."""


@lru_cache(maxsize=1)
def _load_artifacts() -> tuple[dict[str, Any], TfidfVectorizer, RandomForestClassifier, RandomForestClassifier]:
    """Load vectorizer, both RF models, and metadata once per process."""
    missing = [path.name for path in REQUIRED_ARTIFACTS if not path.exists()]
    if missing:
        raise ModelArtifactsError(
            f"Missing model files in {MODELS_DIR}: {', '.join(missing)}. "
            "Copy tfidf_vectorizer.joblib, rf_icd10.joblib, and rf_cpt.joblib from Colab."
        )

    try:
        with METADATA_FILE.open(encoding="utf-8") as handle:
            metadata: dict[str, Any] = json.load(handle)

        vectorizer: TfidfVectorizer = joblib.load(VECTORIZER_FILE)
        icd_model: RandomForestClassifier = joblib.load(ICD_MODEL_FILE)
        cpt_model: RandomForestClassifier = joblib.load(CPT_MODEL_FILE)
    except Exception as exc:
        logger.exception("Failed to load MediNoteX model artifacts")
        raise ModelArtifactsError("Could not load trained model artifacts.") from exc

    logger.info(
        "Loaded MediNoteX models (ICD classes=%s, CPT classes=%s)",
        metadata.get("n_icd_classes"),
        metadata.get("n_cpt_classes"),
    )
    return metadata, vectorizer, icd_model, cpt_model


def get_model_metadata() -> dict[str, Any]:
    """Return training metadata saved from Colab."""
    metadata, _, _, _ = _load_artifacts()
    return metadata


def _predict_single(
    text: str,
    model: RandomForestClassifier,
    vectorizer: TfidfVectorizer,
    top_k: int = 5,
) -> dict[str, Any]:
    """Predict a medical code with confidence and top-k probabilities."""
    note = str(text).strip()
    if not note:
        raise ValueError("clinical_note cannot be empty")

    features = vectorizer.transform([note])
    probabilities = model.predict_proba(features)[0]
    classes = model.classes_

    ranked_indices = np.argsort(probabilities)[::-1][:top_k]
    top_predictions = [
        {
            "code": str(classes[index]),
            "probability": round(float(probabilities[index]), 4),
        }
        for index in ranked_indices
    ]

    best_index = ranked_indices[0]
    return {
        "predicted_code": str(classes[best_index]),
        "confidence": round(float(probabilities[best_index]), 4),
        "top_predictions": top_predictions,
    }


def predict_icd(text: str, top_k: int = 5) -> dict[str, Any]:
    """Predict ICD-10 code from a clinical note."""
    _, vectorizer, icd_model, _ = _load_artifacts()
    return _predict_single(text, icd_model, vectorizer, top_k=top_k)


def predict_cpt(text: str, top_k: int = 5) -> dict[str, Any]:
    """Predict CPT code from a clinical note."""
    _, vectorizer, _, cpt_model = _load_artifacts()
    return _predict_single(text, cpt_model, vectorizer, top_k=top_k)
