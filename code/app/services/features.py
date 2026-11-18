"""
Feature engineering -- shared, on purpose, between the offline training
script (app/ml/train_scoring_model.py) and the online scoring service
(app/services/scoring_service.py). If those two computed features
differently you'd get train/serve skew: the model would be evaluated on data
that doesn't match what it sees in production. Both call `compute_raw_features`.

Every rate/ratio feature is `np.nan` when there's no underlying data (e.g. an
independent borrower with zero savings records has `savings_regularity =
NaN`, not 0 -- 0 would falsely say "never saves" when the truth is "unknown").
NaN is handled explicitly at both train time (median imputation, stats
persisted) and inference time (same persisted stats), never silently.
"""
from datetime import date

import numpy as np

TODAY = date.today()

# NOTE: `n_repayment_events` is deliberately NOT a model feature (it is still
# computed in compute_raw_features, where the cold-start blend and anomaly
# detection use it). As a feature it measures history *length*, not repayment
# quality, and made the score step up/down by tens of points every time any
# payment -- on time or not -- was recorded.
FEATURE_COLUMNS = [
    "monthly_income", "has_bank_account", "is_shg_linked",
    "n_loans", "n_closed_loans",
    "on_time_rate", "late_rate", "partial_rate", "missed_rate",
    "avg_days_late", "savings_regularity", "savings_consistency",
    "shg_tenure_months", "attendance_rate", "shg_peer_repayment_rate",
]


def _months_between(d1, d2):
    return (d1.year - d2.year) * 12 + (d1.month - d2.month)


def compute_raw_features(individual) -> dict:
    """Pull every signal we have on one individual into a flat feature dict.
    Deliberately reads through SQLAlchemy relationships (not a fresh SQL
    query) so it works uniformly whether the individual was just loaded fresh
    or is being scored right after a new repayment was recorded in the same
    session."""
    loans = individual.loans
    events = [e for l in loans for e in l.repayment_events]
    n_events = len(events)
    on_time = sum(1 for e in events if e.status == "On_Time")
    late = sum(1 for e in events if e.status == "Late")
    partial = sum(1 for e in events if e.status == "Partial")
    missed = sum(1 for e in events if e.status == "Missed")
    days_late_list = [e.days_late for e in events if e.status in ("Late", "Missed") and e.days_late]

    savings = individual.savings_records
    savings_ratios = [
        (s.amount_saved / s.amount_expected) for s in savings if s.amount_expected and s.amount_expected > 0
    ]

    attendance = individual.attendance_records
    n_meetings = len(attendance)
    n_present = sum(1 for a in attendance if a.present)

    shg = individual.shg
    shg_tenure_months = _months_between(TODAY, shg.formed_date) if shg else 0

    # SHG peers' aggregate on-time rate, EXCLUDING this individual's own
    # events -- including self would let a member's own outcome leak into
    # their own feature via the group average (circular).
    shg_peer_rate = np.nan
    if shg:
        peer_events = [
            e for m in shg.members if m.id != individual.id
            for l in m.loans for e in l.repayment_events
        ]
        if peer_events:
            shg_peer_rate = sum(1 for e in peer_events if e.status == "On_Time") / len(peer_events)

    return {
        "individual_id": individual.id,
        "monthly_income": individual.monthly_income or 0.0,
        "has_bank_account": int(bool(individual.has_bank_account)),
        "is_shg_linked": int(individual.shg_id is not None),
        "n_loans": len(loans),
        "n_closed_loans": sum(1 for l in loans if l.status == "Closed"),
        "n_repayment_events": n_events,
        "on_time_rate": (on_time / n_events) if n_events else np.nan,
        "late_rate": (late / n_events) if n_events else np.nan,
        "partial_rate": (partial / n_events) if n_events else np.nan,
        "missed_rate": (missed / n_events) if n_events else np.nan,
        "avg_days_late": float(np.mean(days_late_list)) if days_late_list else 0.0,
        "savings_regularity": float(np.mean(savings_ratios)) if savings_ratios else np.nan,
        "savings_consistency": float(np.std(savings_ratios)) if len(savings_ratios) > 1 else np.nan,
        "shg_tenure_months": shg_tenure_months,
        "attendance_rate": (n_present / n_meetings) if n_meetings else np.nan,
        "shg_peer_repayment_rate": shg_peer_rate,
        # not a model feature -- used to build the training label, stripped before fit
        "_has_default": int(any(l.status in ("Defaulted", "Written_Off") for l in loans)),
    }
