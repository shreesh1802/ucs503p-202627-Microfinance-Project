"""
Core scoring engine training (Stage 2).

Per the project plan, the MVP model is trained on SHG-linked individuals
only: they're the population with the richest signal (attendance, peer
repayment rate, SHG tenure, on top of the loan/savings history everyone has),
so that's where a first model has the best chance of being genuinely
predictive rather than guessing. Stage 3 (app/services/bootstrap.py) is what
extends coverage to independent borrowers -- it reuses this exact trained
model (independents just have SHG-specific features imputed as "no group",
not a different model) and blends its output with a path-appropriate prior.

Label: does this individual have at least one Defaulted/Written_Off loan in
their history? That's a legitimate target for a credit model -- using a
borrower's own past repayment behaviour to predict portfolio-level default
risk is exactly what real bureau-based scoring does; the "leakage" concern
would only apply if we used a single loan's own outcome to predict that same
loan, which we don't.

Run with:  python -m app.ml.train_scoring_model
"""
import json

import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split

from app.config import ARTIFACTS_DIR
from app.db import SessionLocal
from app.models import Individual
from app.services.features import FEATURE_COLUMNS, compute_raw_features

MIN_REPAYMENT_EVENTS = 3       # need at least a few data points per person to trust their rates
TRAIN_ON_SHG_LINKED_ONLY = True  # see module docstring -- Stage 2 scope per the project plan

MONOTONE_ON_P_DEFAULT = {
    "on_time_rate": -1, "savings_regularity": -1, "attendance_rate": -1,
    "shg_peer_repayment_rate": -1,
    "late_rate": 1, "partial_rate": 1, "missed_rate": 1, "avg_days_late": 1,
}

MODEL_PATH = ARTIFACTS_DIR / "scoring_model.json"
META_PATH = ARTIFACTS_DIR / "scoring_meta.json"


def build_training_frame(db):
    query = db.query(Individual)
    if TRAIN_ON_SHG_LINKED_ONLY:
        query = query.filter(Individual.shg_id.isnot(None))
    individuals = query.all()

    rows = [compute_raw_features(ind) for ind in individuals]
    df = pd.DataFrame(rows)
    df = df[df["n_repayment_events"] >= MIN_REPAYMENT_EVENTS].reset_index(drop=True)
    return df


def run():
    db = SessionLocal()
    try:
        df = build_training_frame(db)
    finally:
        db.close()

    print(f"Training frame: {len(df)} individuals "
          f"(SHG-linked only: {TRAIN_ON_SHG_LINKED_ONLY}, min events: {MIN_REPAYMENT_EVENTS})")
    print(f"Default rate in training population: {df['_has_default'].mean():.3f}")

    X = df[FEATURE_COLUMNS].copy()
    y = df["_has_default"]

    # Median imputation, computed once here and persisted -- the online
    # scoring service must reuse these exact values, never recompute its own,
    # or a single independent borrower being scored would shift medians for
    # everyone (and train/serve would drift apart).
    medians = X.median(numeric_only=True).to_dict()
    X = X.fillna(medians)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Monotone constraints, expressed on P(default): more of a "good" behaviour
    # can only lower default risk (-1), more of a "bad" one can only raise it
    # (+1). Without these the trees fit noise on ~470 rows, so e.g. a borrower
    # with a higher late_rate or avg_days_late could score *higher*.
    cons = "(" + ",".join(str(MONOTONE_ON_P_DEFAULT.get(c, 0)) for c in FEATURE_COLUMNS) + ")"
    model = xgb.XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9,
        eval_metric="logloss", random_state=42,
        monotone_constraints=cons,
    )
    model.fit(X_train, y_train)

    proba_test = model.predict_proba(X_test)[:, 1]
    pred_test = (proba_test >= 0.5).astype(int)
    print("\n=== Holdout evaluation ===")
    print(f"Accuracy: {accuracy_score(y_test, pred_test):.3f}")
    if y_test.nunique() > 1:
        print(f"ROC AUC:  {roc_auc_score(y_test, proba_test):.3f}")
    print(classification_report(y_test, pred_test, target_names=["No default", "Defaulted"]))

    # SHAP: TreeExplainer is exact (not approximate) for gradient-boosted trees.
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_train)
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    importance = sorted(zip(FEATURE_COLUMNS, mean_abs_shap), key=lambda t: -t[1])
    print("\n=== Feature importance (mean |SHAP|) ===")
    for name, val in importance:
        print(f"  {name:28s} {val:.4f}")

    model.save_model(str(MODEL_PATH))
    meta = {
        "feature_columns": FEATURE_COLUMNS,
        "impute_medians": medians,
        "shap_expected_value": float(np.atleast_1d(explainer.expected_value)[0]),
        "trained_on_shg_linked_only": TRAIN_ON_SHG_LINKED_ONLY,
        "min_repayment_events": MIN_REPAYMENT_EVENTS,
        "n_training_rows": len(df),
        "holdout_accuracy": float(accuracy_score(y_test, pred_test)),
        "holdout_auc": float(roc_auc_score(y_test, proba_test)) if y_test.nunique() > 1 else None,
    }
    META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"\nSaved model to {MODEL_PATH}")
    print(f"Saved metadata to {META_PATH}")


if __name__ == "__main__":
    run()
