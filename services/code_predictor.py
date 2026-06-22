import joblib

model1 = joblib.load(
    "models/icd_model.pkl"
)
model2 = joblib.load(
    "models/cpt_model.pkl"
)
vectorizer = joblib.load(
    "models/vectorizer.pkl"
)