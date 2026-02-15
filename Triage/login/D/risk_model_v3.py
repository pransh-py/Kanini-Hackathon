import pandas as pd
import joblib
import numpy as np
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
risk_model = joblib.load(os.path.join(BASE_DIR, "triage_model.pkl"))
risk_features = joblib.load(os.path.join(BASE_DIR, "model_features.pkl"))


def predict_risk(input_row, top_n=8, threshold=0):

    if isinstance(input_row, dict):
        df = pd.DataFrame([input_row])
    elif isinstance(input_row, pd.Series):
        df = pd.DataFrame([input_row.to_dict()])
    elif isinstance(input_row, pd.DataFrame):
        df = input_row.copy()
    else:
        raise ValueError("Input must be dict, Series, or DataFrame")

    for col in ["Risk", "Department"]:
        if col in df.columns:
            df = df.drop(columns=[col])

    if "Gender" in df.columns:
        df = pd.get_dummies(df, columns=["Gender"], drop_first=True)

    for col in risk_features:
        if col not in df.columns:
            df[col] = 0

    df = df[risk_features]

    prediction = risk_model.predict(df)[0]
    probabilities = risk_model.predict_proba(df)[0]

    class_index = list(risk_model.classes_).index(prediction)
    confidence = round(float(probabilities[class_index]) * 100, 2)

    override = (
        (df["Systolic_BP"] >= 200)
        | (df["Heart_Rate"] >= 150)
        | (df["Loss_of_Consciousness"] == 1)
        | (df["Uncontrolled_Bleeding"] == 1)
        | (df["Seizure"] == 1)
        | (df["Severe_Trauma"] == 1)
        | (df["Severe_Allergic_Reaction"] == 1)
    )

    if override.iloc[0]:
        prediction = "High"

    importances = risk_model.feature_importances_

    contribution_scores = abs(df.iloc[0] * importances)

    if contribution_scores.sum() == 0:
        contribution_scores = importances

    contribution_series = pd.Series(
        contribution_scores,
        index=risk_features
    )

    contribution_series = contribution_series[
        contribution_series > 0
    ]

    contribution_series = contribution_series.sort_values(
        ascending=False
    )

    filtered = contribution_series[
        contribution_series > threshold
    ]

    if filtered.empty:
        top_factors = contribution_series.head(top_n)
    else:
        top_factors = filtered.head(top_n)


    return {
        "Risk": prediction,
        "Confidence": confidence,
        "Top_Contributing_Factors": top_factors.to_dict(),
    }
