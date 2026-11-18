"""
Synthetic dataset generator (Stage 1).

Real SHG/loan data doesn't exist for this project, so every downstream module
(scoring engine, bootstrap logic, lender matching, clustering, anomaly
detection) has to work off data we make up -- but it has to be made up with
real *structure*, or the scoring model has nothing to learn and every result
downstream is theater.

The core trick: every individual gets a hidden "true creditworthiness" latent
trait (`z`, roughly standard-normal) that we never store directly. Every
*observable* signal -- repayment behaviour, savings regularity, SHG meeting
attendance -- is generated as a noisy function of that latent trait. That's
what makes this a legitimate ML problem instead of a random number generator:
the model has to recover `z` from noisy correlated observations, the same way
a real credit model recovers creditworthiness from noisy correlated bureau
data.

Two deliberate modelling choices worth knowing about, because they shape what
the trained model (Stage 2) will learn:

1. SHG-linked and independent individuals draw `z` from the *same*
   distribution. SHG membership is not used as a proxy for "this person is
   inherently more creditworthy" -- that would bake a fairness problem into
   the ground truth before the model ever sees it, and it would contradict
   the project's own premise that independents can be just as good.
2. SHG membership DOES have a real (small) causal bump on top of `z`: members
   of a strong SHG get a modest boost to their *observed* repayment behaviour
   (peer accountability is a real phenomenon -- it's literally why SHG
   lending works in practice). That's separate from the score BOOTSTRAP
   advantage handled in Stage 3; this is about behaviour, that's about prior.

Run with:  python -m app.ml.data_gen
"""
import math
import random
from datetime import date, timedelta

import numpy as np
from faker import Faker

from app.db import Base, SessionLocal, engine
from app.models import (
    AnomalyFlag, CreditScore, District, Individual, Lender, Loan, LoanOffer,
    RepaymentEvent, SavingsRecord, SHG, SHGAttendanceRecord, SHGLenderLink,
    ScoreExplanation,
)
from app.services.auth_service import DEMO_PASSWORD, hash_password

SEED = 42
random.seed(SEED)
rng = np.random.default_rng(SEED)
fake = Faker("en_IN")
Faker.seed(SEED)

TODAY = date.today()

# Every seeded individual gets the same demo password (hashed once up front --
# it's identical for everyone, so re-hashing per row would just be 1000+
# PBKDF2 runs for no benefit). See app/services/auth_service.py.
DEMO_PASSWORD_HASH = hash_password(DEMO_PASSWORD)

# ---------------------------------------------------------------------------
# Tunable population sizes -- kept small enough to run in seconds on a laptop,
# large enough that the model has something to learn from.
# ---------------------------------------------------------------------------
N_SHGS_PER_DISTRICT = (4, 8)          # randint range
MEMBERS_PER_SHG = (8, 18)
N_INDEPENDENTS = 420                   # roughly 30% of the SHG-linked population
LOANS_PER_INDIVIDUAL = (0, 3)          # 0 means "no borrowing history yet" -- deliberately common
N_LENDERS = 6

DISTRICTS = [
    ("Jaipur", "Rajasthan", 26.9124, 75.7873),
    ("Ajmer", "Rajasthan", 26.4499, 74.6399),
    ("Lucknow", "Uttar Pradesh", 26.8467, 80.9462),
    ("Varanasi", "Uttar Pradesh", 25.3176, 82.9739),
    ("Bhopal", "Madhya Pradesh", 23.2599, 77.4126),
    ("Indore", "Madhya Pradesh", 22.7196, 75.8577),
    ("Patna", "Bihar", 25.5941, 85.1376),
    ("Nagpur", "Maharashtra", 21.1458, 79.0882),
    ("Ahmedabad", "Gujarat", 23.0225, 72.5714),
    ("Bhubaneswar", "Odisha", 20.2961, 85.8245),
]
# Coordinates are approximate district-HQ centroids for the Stage-7 heatmap demo,
# not survey-grade GIS data.

OCCUPATIONS = ["Tailoring", "Farming", "Dairy", "Handicrafts", "Retail", "Labour", "Poultry", "Weaving"]
INCOME_BASE = {
    "Tailoring": 5500, "Farming": 4200, "Dairy": 4800, "Handicrafts": 4000,
    "Retail": 6500, "Labour": 3800, "Poultry": 5000, "Weaving": 4500,
}

LENDER_NAMES = [
    ("Gramin Sahakari Bank", "Bank"), ("Rural Trust NBFC", "NBFC"),
    ("Sahara Microfinance", "MFI"), ("VikasCapital", "Fintech"),
    ("District Cooperative Bank", "Bank"), ("Bharosa Finance", "NBFC"),
]


def sigmoid(x):
    return 1 / (1 + math.exp(-x))


def draw_latent():
    """The hidden 'true creditworthiness' trait. Never stored -- only its
    noisy footprints (repayments, savings, attendance) are."""
    return float(rng.normal(0, 1))


def behaviour_weights(z):
    """Map latent z -> a probability distribution over repayment outcomes,
    via a softmax over per-category linear scores in z.

    Calibrated so an *average* borrower (z=0) lands close to real-world SHG
    repayment rates (~75-80% on-time -- that track record is the whole reason
    SHG lending works), a strong borrower (z~+1.5) is close to 99% on-time,
    and a weak one (z~-1.5) is mostly Late/Partial/Missed. The gap between
    those is what gives the Stage-2 model real signal to recover."""
    scores = {
        "On_Time": 2.2 + 1.6 * z,
        "Late": 0.3 - 0.5 * z,
        "Partial": -0.2 - 0.7 * z,
        "Missed": -0.5 - 1.3 * z,
    }
    exp_scores = {k: math.exp(v) for k, v in scores.items()}
    total = sum(exp_scores.values())
    return {k: v / total for k, v in exp_scores.items()}


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def seed_districts(db):
    rows = []
    for name, state, lat, lon in DISTRICTS:
        d = District(name=name, state=state, lat=lat, lon=lon)
        db.add(d)
        rows.append(d)
    db.flush()
    return rows


def seed_shgs(db, districts):
    shgs = []
    for d in districts:
        for _ in range(random.randint(*N_SHGS_PER_DISTRICT)):
            formed = TODAY - timedelta(days=random.randint(180, 6 * 365))
            n_members = random.randint(*MEMBERS_PER_SHG)
            shg = SHG(
                name=f"{fake.first_name()} {random.choice(['Mahila Shakti', 'Vikas', 'Swayam Sahayata', 'Unnati'])} Group",
                village=fake.city(),
                district_id=d.id,
                formed_date=formed,
                total_members=n_members,
                status="Active",
            )
            db.add(shg)
            shgs.append(shg)
    db.flush()
    return shgs


def make_individual(db, district_id, shg=None, shg_quality=None):
    z = draw_latent()
    if shg is not None:
        # Peer-accountability bump: being in a strong SHG genuinely improves
        # observed behaviour on top of the person's own latent trait.
        z_observed = 0.75 * z + 0.35 * shg_quality + float(rng.normal(0, 0.3))
    else:
        z_observed = z

    occupation = random.choice(OCCUPATIONS)
    income = max(1500, INCOME_BASE[occupation] * float(rng.normal(1.0, 0.25)) + 200 * max(z, 0))
    has_bank = random.random() < sigmoid(0.9 * z + 0.4)

    joined = TODAY - timedelta(days=random.randint(30, 5 * 365))
    ind = Individual(
        name=fake.name(),
        phone=fake.unique.msisdn()[:10],
        district_id=district_id,
        village=fake.city(),
        occupation=occupation,
        monthly_income=round(income, 2),
        has_bank_account=has_bank,
        shg_id=shg.id if shg else None,
        joined_date=joined,
        status="Active",
        password_hash=DEMO_PASSWORD_HASH,
    )
    db.add(ind)
    db.flush()
    return ind, z_observed, joined


def seed_savings(db, individual, z, joined_date, is_shg):
    expected = 200 if is_shg else round(random.uniform(100, 400), 0)
    months = min(18, max(1, (TODAY.year - joined_date.year) * 12 + (TODAY.month - joined_date.month)))
    q = sigmoid(1.5 * z)
    for m in range(months):
        period = (joined_date.replace(day=1) + timedelta(days=32 * m)).replace(day=1)
        if period > TODAY:
            break
        # Regularity: probability of saving close to the expected amount rises with q
        factor = np.clip(rng.normal(0.4 + 0.7 * q, 0.2), 0, 1.3)
        db.add(SavingsRecord(
            individual_id=individual.id, period=period,
            amount_expected=expected, amount_saved=round(expected * float(factor), 2),
        ))


def seed_attendance(db, individual, shg, z_observed):
    if shg is None:
        return
    months = min(24, max(1, (TODAY.year - individual.joined_date.year) * 12 + (TODAY.month - individual.joined_date.month)))
    p_present = np.clip(sigmoid(1.6 * z_observed + 0.2), 0.15, 0.97)
    d = individual.joined_date
    for _ in range(months):
        d = d + timedelta(days=30)
        if d > TODAY:
            break
        db.add(SHGAttendanceRecord(
            shg_id=shg.id, individual_id=individual.id,
            meeting_date=d, present=bool(rng.random() < p_present),
        ))


def seed_loans_and_repayments(db, individual, z_observed):
    n_loans = random.randint(*LOANS_PER_INDIVIDUAL)
    weights = behaviour_weights(z_observed)
    outcomes = list(weights.keys())
    probs = list(weights.values())

    for _ in range(n_loans):
        principal = round(random.choice([8000, 10000, 15000, 20000, 25000, 30000]) * float(rng.normal(1.0, 0.1)), -2)
        rate = round(random.uniform(12, 22), 2)
        tenure = random.choice([6, 9, 12, 18, 24])
        disb = TODAY - timedelta(days=random.randint(60, 900))
        emi = round(principal * (1 + rate / 100 * tenure / 12) / tenure, 2)

        loan = Loan(
            individual_id=individual.id, lender_id=None,  # pre-marketplace synthetic history
            principal_amount=principal, interest_rate=rate, tenure_months=tenure,
            disbursement_date=disb, outstanding_balance=principal,
            status="Active", purpose=random.choice(["Small business", "Agriculture", "Livestock", "Household", "Education"]),
        )
        db.add(loan)
        db.flush()

        paid_total = 0.0
        missed_count = 0
        late_count = 0
        partial_count = 0
        events_so_far = 0
        due = disb
        for emi_no in range(1, tenure + 1):
            due = disb + timedelta(days=30 * emi_no)
            if due > TODAY:
                break  # future EMI, not due yet -- no event row (mirrors real collections systems)
            events_so_far += 1
            outcome = rng.choice(outcomes, p=probs)

            if outcome == "On_Time":
                pay_date = due - timedelta(days=random.randint(0, 3))
                amount_paid, days_late = emi, 0
            elif outcome == "Late":
                days_late = random.randint(1, 20)
                pay_date = due + timedelta(days=days_late)
                amount_paid = emi
                late_count += 1
            elif outcome == "Partial":
                days_late = random.randint(0, 10)
                pay_date = due + timedelta(days=days_late)
                amount_paid = round(emi * random.uniform(0.3, 0.8), 2)
                partial_count += 1
            else:  # Missed
                pay_date, amount_paid = None, 0.0
                days_late = (TODAY - due).days
                missed_count += 1

            db.add(RepaymentEvent(
                loan_id=loan.id, due_date=due, payment_date=pay_date,
                amount_due=emi, amount_paid=amount_paid, days_late=days_late,
                status=outcome,
            ))
            paid_total += amount_paid

        loan.outstanding_balance = max(0.0, round(principal - paid_total, 2))

        if events_so_far >= 3:
            missed_frac = missed_count / events_so_far
            late_frac = late_count / events_so_far
            partial_frac = partial_count / events_so_far
            # A smooth "how much trouble is this loan in" index, missed weighted
            # heaviest, late/partial weighted lighter -- NOT a hard threshold.
            # Sampling the default outcome probabilistically (rather than a
            # deterministic missed_frac > 0.4 cliff) avoids two problems: (1) with
            # only 1-3 loans per person, a hard cutoff makes "Defaulted" a
            # near-coin-flip right at the boundary, which is pure label noise for
            # a model to learn from; (2) it lets loans with real but sub-cliff
            # trouble (e.g. 1/3 missed, no late/partial) carry a real chance of
            # being labelled Defaulted instead of always reading as safe.
            trouble = missed_frac + 0.35 * late_frac + 0.20 * partial_frac
            p_default = float(np.clip(2.0 * trouble - 0.25, 0.02, 0.95))
            if rng.random() < p_default:
                loan.status = "Defaulted"
            elif loan.outstanding_balance <= 0.01:
                loan.status = "Closed"
            else:
                loan.status = "Active"
        elif loan.outstanding_balance <= 0.01:
            loan.status = "Closed"
        else:
            loan.status = "Active"


def seed_lenders(db):
    lenders = []
    for name, ltype in LENDER_NAMES:
        lenders.append(Lender(
            name=name, type=ltype,
            min_score_threshold=random.choice([450, 500, 550, 600, 650]),
            max_loan_amount=random.choice([25000, 40000, 60000, 100000]),
            base_interest_rate=round(random.uniform(11, 20), 2),
            serves_independents=random.random() < 0.75,
        ))
    db.add_all(lenders)
    db.flush()
    return lenders


def seed_shg_lender_links(db, shgs, lenders):
    for shg in shgs:
        for lender in random.sample(lenders, k=random.randint(1, min(3, len(lenders)))):
            status = random.choices(["Approved", "Pending", "Rejected"], weights=[0.7, 0.2, 0.1])[0]
            # Cap at TODAY -- formed_date + a random offset can otherwise land
            # in the future for recently-formed SHGs, which makes no sense for
            # a "date this was requested" field.
            requested = min(TODAY, shg.formed_date + timedelta(days=random.randint(30, 800)))
            decided = min(TODAY, requested + timedelta(days=random.randint(1, 30))) if status != "Pending" else None
            db.add(SHGLenderLink(
                shg_id=shg.id, lender_id=lender.id, status=status,
                requested_date=requested,
                decided_date=decided,
            ))


def run():
    print(f"Resetting database and seeding synthetic data (seed={SEED})...")
    reset_db()
    db = SessionLocal()
    try:
        districts = seed_districts(db)
        shgs = seed_shgs(db, districts)
        db.commit()

        shg_quality = {shg.id: draw_latent() for shg in shgs}

        n_shg_members = 0
        for shg in shgs:
            for _ in range(shg.total_members):
                ind, z_obs, joined = make_individual(db, shg.district_id, shg=shg, shg_quality=shg_quality[shg.id])
                seed_savings(db, ind, z_obs, joined, is_shg=True)
                seed_attendance(db, ind, shg, z_obs)
                seed_loans_and_repayments(db, ind, z_obs)
                n_shg_members += 1
        db.commit()

        n_independent = 0
        for _ in range(N_INDEPENDENTS):
            d = random.choice(districts)
            ind, z_obs, joined = make_individual(db, d.id, shg=None)
            seed_savings(db, ind, z_obs, joined, is_shg=False)
            seed_loans_and_repayments(db, ind, z_obs)
            n_independent += 1
        db.commit()

        lenders = seed_lenders(db)
        seed_shg_lender_links(db, shgs, lenders)
        db.commit()

        # The loans above were seeded before lenders/links existed; attribute
        # them to a lender the marketplace rules would actually allow.
        from app.ml.migrate_loan_lenders import backfill_loan_lenders
        assigned, left_null = backfill_loan_lenders(db)
        db.commit()
        print(f"Attributed {assigned} seeded loans to a lender ({left_null} left unattributed).")

        print(f"Done. Districts={len(districts)} SHGs={len(shgs)} "
              f"SHG-linked individuals={n_shg_members} independents={n_independent} "
              f"lenders={len(lenders)}")
        print(f"Every borrower can log in on the 'My Score' page with their phone number "
              f"and the password '{DEMO_PASSWORD}'.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
