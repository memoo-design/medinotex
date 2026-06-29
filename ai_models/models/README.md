# Model artifacts (from Google Colab)

Copy these files from your Colab `/content/models/` folder into this directory:

- `tfidf_vectorizer.joblib`
- `rf_icd10.joblib`
- `rf_cpt.joblib`
- `metadata.json` (already included)

Training metrics (baseline RF):

| Model | Top-1 | Top-3 |
|-------|-------|-------|
| ICD-10 | 1.08% | 2.70% |
| CPT | 2.08% | 5.65% |

These `.joblib` files are large — do not commit them to Git unless using Git LFS.
