# CreditSetu -- Dual-Path Microfinance Credit Scoring

An individual credit-scoring system for microfinance lending in India. The core idea:
every borrower builds their **own** credit score from their own repayment history, but
someone who belongs to a Self-Help Group (SHG) gets a head start — a bootstrap score
derived from their group's track record — while an independent borrower starts lower
and builds purely from scratch. Lenders formally partner with specific SHGs (an
approve/reject linkage, not open lending to anyone), and a scoring engine
(XGBoost + SHAP) explains *why* each score is what it is, not just what it is.

This is a from-scratch rebuild. An earlier version of this project (`Sahara MFI`, a
Node/Express + MySQL app) is on GitHub at `shreesh1802/microfinance_project` — it had
SHG-only scoring via a hand-written SQL formula, no independent-borrower path, no ML,
and no lender marketplace. This build keeps none of that schema (the dual-path design
needed a different one — see "Why a fresh schema" below) but the general shape of the
domain (SHGs, loans, repayments, credit scores) carries over.

## Architecture

```
app/
  models.py              SQLAlchemy schema (13 tables, see below)
  config.py               DB URL + scoring knobs (bootstrap weights, score range)
  db.py                    Engine/session setup (SQLite by default, Postgres via env var)
  schemas.py              Pydantic request bodies for the write endpoints
  main.py                  FastAPI app, wires up all routers

  ml/                      Offline scripts (run from the command line, not imported by the API)
    data_gen.py              Stage 1: synthetic population + loans + repayments + lenders
    migrate_auth.py          One-off, idempotent: lender/SHG credentials + session tables
    migrate_payments.py      One-off, idempotent: wallet_balance + target_lender_id columns
    migrate_close_paid_loans.py  One-off, idempotent: closes Active loans with nothing owed
    migrate_loan_lenders.py  One-off, idempotent: attributes seeded loans to an eligible lender
    train_scoring_model.py   Stage 2: trains the (monotone-constrained) XGBoost model + SHAP metadata
    score_all.py             Batch-scores every individual (appends to credit_scores)
    clustering.py             Stage 7: k-means district clustering (called live by the API)
    anomaly.py                Stage 8: isolation-forest outlier detection

  services/                Business logic the API routes call into
    features.py               Feature engineering shared between training and serving
    scoring_service.py        Stage 2 model + Stage 3 cold-start bootstrap blending
    linkage_service.py        Stage 4: SHG <-> lender approve/reject
    matching_service.py       Stage 5: eligible-borrower filtering + loan offers
    loan_request_service.py   Borrower-initiated loan requests (broadcast or one target lender)
    payment_service.py        Due-summary + live repayment (see "Repaying a loan" below)

  routers/                  FastAPI endpoints, one file per resource

frontend/                 React (Vite) app, five routed views: Home / Borrower / My Score / SHG-Lender / Bank
```

### Data model

Thirteen core tables (plus the session tables for auth, `loan_requests` and
`loan_request_declines` — see `app/models.py` for the full list): `districts`,
`shgs`, `individuals` (the dual-path pivot —
`shg_id` is nullable; NULL means independent), `shg_attendance_records`,
`savings_records`, `lenders`, `shg_lender_links` (the Stage-4 approve/reject
table), `loans`, `repayment_events`, `credit_scores` (append-only history, not
a single mutable column), `score_explanations` (per-feature SHAP contribution
per score, in score points), `loan_offers` (the Stage-5 marketplace flow), and
`anomaly_flags`.

**Why a fresh schema instead of extending the old one:** the old schema had no
independent-borrower path, no lender entity, and no SHG-lender linkage table —
all three are core to this design, and retrofitting them onto MySQL-specific
PL/SQL triggers/procedures that don't fit a Python scoring engine wasn't worth it.

### Scoring pipeline (Stages 2-3)

1. **Feature engineering** (`services/features.py`) turns one individual's loans,
   repayments, savings, and SHG attendance into 15 model features — repayment
   rates, savings regularity, SHG tenure, peer repayment rate, etc. NaN means "no
   data", never a silent zero. `n_repayment_events` is computed but deliberately
   **not** a model feature: it measures how long a history is, not how well the
   person repays, and as a feature it made the score jump by tens of points every
   time *any* payment was recorded.
2. **Training** (`ml/train_scoring_model.py`) fits an XGBoost classifier on
   SHG-linked individuals with >=3 repayment events (~475 rows), predicting "does
   this person have a defaulted loan." SHAP (`TreeExplainer`) explains every
   prediction. The model is trained with **monotone constraints**
   (`MONOTONE_ON_P_DEFAULT`): more on-time repayment, savings regularity,
   attendance or peer repayment can only lower predicted default risk, and more
   late/partial/missed repayments or more days late can only raise it. On a
   dataset this small an unconstrained tree fits noise — e.g. a *higher* late rate
   could produce a *higher* score. Constraints cost no accuracy (5-fold CV AUC
   0.913 vs 0.915 unconstrained; single 95-person holdout AUC 0.90) and fixed the
   behaviour: after adding one extra repayment to 271 borrowers, an On_Time
   payment never lowered a score (was 19%), and a Missed payment never scored
   better than On_Time. One event is still small relative to the model's splits,
   so most borrowers see *no* change from a single extra On_Time payment.
3. **Cold-start bootstrap** (`services/scoring_service.py`): with 0 repayment
   events, score = pure prior (SHG peer track record, or a flat lower base for
   independents — no model call, there's nothing to look at yet). Between 1 and
   `HISTORY_MATURITY_EVENTS` (6) events, it's a linear blend of the prior and the
   model's output. Past that, it's the model alone. (`n_repayment_events` still
   drives this blend weight — it just isn't a model input anymore, see below.)
4. **Explanation**: each `ScoreExplanation` row is denominated in *score points*
   and sums to `score - SCORE_MIN`, so the frontend renders a "starting floor +
   what added points" waterfall — anchored on the model's own baseline
   prediction (not the floor), so a high-risk borrower's explanation stays
   legible instead of collapsing to near-zero (see "Bugs found & fixed" below).

## Borrower login ("My Score")

Every seeded individual can log in on the "My Score" page to see their own current
score, score history, and SHAP explanation without needing to search themselves up
in the Borrower view. Log in with any individual's phone number (visible in the
Borrower search table) and the password `password123` -- every synthetic borrower
gets that same demo password when `data_gen` seeds the database (see
`app/services/auth_service.py`).

This is a plain bearer-token session (`individual_sessions` table), not JWT --
deliberately, so logging into a demo dataset doesn't require adding a new
dependency.

## Lender / SHG / Admin login (role-gated redesign)

Every endpoint now requires a valid bearer token for the right role --
`Authorization: Bearer <token>` -- verified server-side, not just hidden in
the UI (see `docs/SPEC.md` / `docs/API_CONTRACT.md`). Four separate logins,
same PBKDF2 + opaque-token pattern as the borrower login above:

- **Borrower**: phone number + `password123` (unchanged, see above).
- **Lender**: username = slug of the lender's name (e.g. `gramin-sahakari-bank`
  for "Gramin Sahakari Bank"), password `password123`. `POST /api/auth/lender/login`.
- **SHG**: username = slug of the SHG's name (e.g. `isaac-vikas-group`),
  password `password123`. `POST /api/auth/shg/login`.
- **Admin**: username `admin`, password `admin123` (override with the
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars) -- admin has no DB row, this is
  a config credential, not a fabricated business entity. `POST /api/auth/admin/login`.

Lender/SHG credentials are seeded onto the existing rows by the one-off,
idempotent `python -m app.ml.migrate_auth` (also adds the new columns/tables
this redesign needs) -- run once against `data/microfin.db`, safe to re-run.

From My Score, a borrower can also request a loan directly (principal, tenure,
purpose) instead of only waiting to be matched. The request is broadcast to
every lender they're currently eligible for (an approved SHG link, or a
lender that serves independents) and any one of those lenders can approve it,
which creates the loan immediately -- one lender declining doesn't close the
request for the others. Lenders see and act on these from the same SHG/Lender
page they already use for eligible-borrowers and offers ("Loan requests"
card). My Score also now shows the borrower's own pending/past offers
(lender-initiated) and requests (borrower-initiated) with accept/reject/
withdraw actions, since previously that whole marketplace flow only had
buttons on the *lender's* screen -- a borrower had no way to see or act on an
offer made to them at all.

## Repaying a loan (demo wallet + mock gateway)

A borrower can repay their active loans from "Repay" on their dashboard
(`/borrower/repay`). This is a **demo**: no real money moves.

- **Wallet.** Every individual has a `wallet_balance`, seeded by
  `migrate_payments.py` as `1.5 x monthly_income` (only where it is NULL, so
  re-running never resets a balance that has already moved).
- **Mock gateway.** The page first asks for a gateway sign-in. The credentials
  (`abc` / `123`) are hard-coded in `RepayPage.jsx` and shown on the page — they
  only gate the demo screen and are not real security.
- **What's due.** `GET /api/payments/due-summary?individual_id=` lists each
  Active loan's next EMI, computed fresh and never stored: the standard
  simple-interest EMI, with `cycle_number = (number of repayment events already
  recorded on that loan, of any status) + 1`. Counting events — not calendar time
  — means a loan disbursed seconds ago is payable immediately. Missed and Partial
  events count as resolved cycles, so a missed cycle doesn't block the loan
  forever. A loan is left out when its cycle is past its tenure or its
  outstanding balance is already 0.
- **Paying.** `POST /api/payments/pay` (borrower only, own loans only) pays one
  loan's full EMI. In one transaction it re-reads the wallet, checks the wallet
  covers *that loan's* EMI (sufficiency is per loan, not across all loans),
  records a `RepaymentEvent` (`On_Time` if today is on or before the cycle's
  theoretical due date, otherwise `Late` with `days_late`), deducts the wallet,
  reduces the balance, closes the loan on its last cycle or at 0 balance, and
  recomputes the credit score. Errors: 400 `insufficient_funds` (with
  `wallet_balance` and `amount_due`), 403 for someone else's loan, 404 for an
  unknown loan.
- **Targeted loan requests.** A loan request can name one lender
  (`target_lender_id`, validated against that borrower's eligible lenders) instead
  of broadcasting to all of them.

Design docs: `docs/REQUIREMENTS_PAYMENTS.md`, `docs/DESIGN_PAYMENTS.md`,
`docs/API_CONTRACT_PAYMENTS.md`.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cd frontend && npm install && cd ..
```

## Running it

Order matters — each step depends on the previous one's output:

```bash
source .venv/bin/activate

python -m app.ml.data_gen              # 1. wipes + reseeds the DB with synthetic data
python -m app.ml.migrate_auth          # 2. lender/SHG credentials + session tables
python -m app.ml.migrate_payments      # 3. wallet balances + targeted-request column
python -m app.ml.train_scoring_model   # 4. trains the model, saves to artifacts/
python -m app.ml.score_all             # 5. scores every individual (appends to credit_scores)
python -m app.ml.anomaly               # 6. (optional) runs anomaly detection once up front

uvicorn app.main:app --reload          # 7. API at http://localhost:8000, docs at /docs
```

`migrate_close_paid_loans` and `migrate_loan_lenders` are only for a database seeded
*before* the loan-closing and lender-attribution fixes in `data_gen.py`; a fresh
`data_gen` run doesn't need them. Back up
`data/microfin.db` before testing payments — they write to it (a payment changes a
wallet, a loan, a repayment event and a score).

In a second terminal:

```bash
cd frontend
npm run dev                            # frontend at http://localhost:5173, proxies /api to :8000
```

Re-run `data_gen` any time you want a fresh population (it wipes the DB, including
the credentials and wallet balances the migrations seeded, so repeat steps 2-3), and `train_scoring_model`
+ `score_all` after — a stale model against fresh data (or vice versa) will give
nonsensical scores. Likewise after any data change that touches scoring inputs
(e.g. closing loans changes `n_closed_loans`), stored scores stay stale until the
next `score_all`.

## What's built vs. stretch

All 8 stages from the project plan are implemented and were exercised end-to-end
(not just written — see verification below): synthetic data generation, the
XGBoost+SHAP scoring engine, cold-start bootstrap for both borrower paths,
SHG-lender linkage, lender matching + loan offers, all three frontend
dashboards, k-means geo-clustering, and isolation-forest anomaly detection.

**Deliberately out of scope** (not in the original 8-stage plan, and skipped to
keep this a scoring/marketplace system rather than a full loan-servicing
platform): a stored EMI due-date schedule / field-agent collections workflow
(the old repo had this — upcoming dues are computed on demand by
`payment_service.py`, never stored; there is no arrears catch-up, partial
payments or real payment processing), and a persisted geo-clustering results
table (it's cheap enough — 10 districts — to recompute on every request
instead). Authentication/authorization and the demo repayment flow were out of
scope at first but have since been added (see the login and repayment sections).

## Bugs found & fixed during the build

Worth knowing about because they shaped design decisions, not just because they
were bugs:

1. **Synthetic default rule was a hard cliff.** Loans only flipped to `Defaulted`
   at a deterministic `missed_fraction > 0.4` threshold. With 1-3 loans per
   person, that made "defaulted" a near coin-flip right at the boundary — label
   noise, not signal. Replaced with a probabilistic rule where default risk rises
   smoothly with a weighted mix of missed/late/partial behavior. Verified: default
   rate now climbs cleanly from 7% to 100% across the missed-rate range instead of
   jumping off a cliff.
2. **SHAP explanation collapsed for risky borrowers.** Points were originally
   allocated as a share of `(score - floor)`. Anyone scoring near the floor —
   exactly the people who most need "why is my score low" — had almost no budget
   to distribute, so the explanation silently went blank. Fixed by anchoring on
   the model's own baseline prediction instead.
3. **SHG-lender link dates could land in the future.** `requested_date` was
   `formed_date + random(30, 800 days)`, which for a recently-formed SHG could
   exceed today. Capped at `TODAY`.
4. **k-means cluster labels were inverted.** "High Trust" was being assigned to
   the lowest-scoring cluster and vice versa — an off-by-reversed-order bug in
   how cluster rank mapped to label text, not in the clustering itself.
5. **Missing indexes on every foreign key** (SQLite/Postgres don't auto-index
   the referencing side of an FK) and **missing `__init__.py`** in three
   subpackages — both would only have surfaced once the dataset or router
   imports grew, so worth fixing before they did.
6. **Unbounded eligible-borrowers table.** One lender had 351 eligible
   borrowers, rendered as one HTML table with no cap — an 18,000px-tall page.
   Capped at 25 with a "showing top N of M" note, same pattern as borrower search.
7. **Frontend/backend pagination mismatch.** The borrower search UI requested
   `limit=1000`; the API caps `limit` at 500 — every request 422'd. Also, the
   original client-side-filter-over-one-page search design meant roughly half
   the population (whichever didn't fit in the first page) was unreachable by
   search regardless of the limit fix — replaced with real server-side search
   (`?search=`) rather than just raising the limit.
8. **`GET /api/shgs` was an N+1 query dressed as a model property.**
   `SHG.aggregate_repayment_rate`/`.aggregate_attendance_rate` walk
   `members -> loans -> repayment_events` in Python; called once per SHG in
   the list endpoint, that's ~25,000+ `RepaymentEvent` ORM objects
   materialized on every request against the real dataset (51 SHGs, 1,079
   individuals) — measured at 1,101–1,322ms median. Replaced with three
   `GROUP BY` SQL aggregates computed once and joined back by id: 14.5–26.7ms
   median, ~75x faster, byte-for-byte identical response content verified
   before/after.

9. **Loans with nothing owed were still payable.** The generator tracked the
   balance as principal only while every EMI includes interest, so loans reached
   a 0 balance before their last cycle and stayed `Active` (64 of them) — the
   Repay page would have charged a full EMI for a loan with nothing owed. The
   generator now closes a loan at 0 balance, a migration fixed existing data, and
   the payment service skips and closes such loans.
10. **A Missed cycle stayed "due" forever.** The cycle pointer counted only
    On_Time/Late events, so Missed and Partial cycles never advanced it (and the
    computed due date contradicted the Missed row). Every recorded event now
    resolves its cycle.
11. **The score didn't respond sensibly to a single payment.** One extra
    On_Time payment lowered the score for 19% of borrowers and a Late one beat
    On_Time for ~20%: the unconstrained model fit noise on ~475 rows, and
    `n_repayment_events` (history length) was a feature. Fixed with monotone
    constraints and dropping that feature (see "Scoring pipeline").

All of the above were caught by actually running the pipeline end-to-end
(training on real data, scoring real individuals, hitting the live API,
screenshotting the live frontend with Playwright and checking for console/network
errors) rather than by reading the code.

## API

Full interactive docs at `/docs` once the server is running. Key endpoints:

- `GET /api/individuals`, `/api/individuals/{id}`, `/api/individuals/{id}/score-history`
- `POST /api/individuals/{id}/recompute-score`
- `GET /api/shgs`, `/api/shgs/{id}`, `/api/shgs/{id}/lenders`
- `POST /api/shgs/{id}/link-lender`
- `GET /api/lenders`, `/api/lenders/{id}/eligible-borrowers`
- `POST /api/links`, `POST /api/links/{id}/decide`
- `POST /api/offers`, `POST /api/offers/{id}/decide`
- `GET /api/geo/districts` (k-means clusters)
- `GET /api/anomalies`, `POST /api/anomalies/run`
- `GET /api/dashboard/summary`
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `POST /api/loan-requests` (optional `target_lender_id`), `GET /api/loan-requests`,
  `POST /api/loan-requests/{id}/decide`, `POST /api/loan-requests/{id}/withdraw`,
  `GET /api/loan-requests/eligible-lenders`
- `GET /api/payments/due-summary?individual_id=`, `POST /api/payments/pay`

## Next steps if you keep building this

- Swap SQLite for Postgres (`DATABASE_URL` env var, no code changes needed) once
  more than one process needs to write concurrently.
- The model is trained once on a static synthetic snapshot; a real version would
  retrain periodically as new repayment data comes in, and would want a proper
  train/holdout split by *time* (predict future behavior from past behavior)
  rather than a random split, to better mirror production.
- Auth is now enforced on every endpoint (borrower/lender/SHG/admin, see
  "Lender / SHG / Admin login" above and `docs/API_CONTRACT.md`). A real
  deployment would still want a real password-hashing
  library and short-lived signed tokens instead of the deliberately-minimal
  bearer-token scheme used here.
- Known gaps in the repayment flow: seeded loans are attributed to a lender by
  `migrate_loan_lenders` / `data_gen` (an Approved-linked lender for SHG members, an
  independents-serving lender for independents), but a loan whose SHG has no
  approved lender stays unattributed and shows "Lender not recorded" (38 loans in
  the current database; ~10% of a fresh seed). The mock gateway credentials are
  hard-coded in the frontend, and Active loans whose events already cover their
  whole tenure but still carry a balance (196) can't be paid — missed cycles are
  treated as written off, not as arrears.
- The independent-vs-SHG score gap (`INDEPENDENT_BASE_SCORE` vs the SHG bootstrap
  formula in `app/config.py`) is a policy choice, not something the data derived —
  worth stating explicitly in any report as a deliberate design parameter, and a
  good candidate for a sensitivity analysis (how much does this weight matter to
  the fairness story between the two borrower paths?).
