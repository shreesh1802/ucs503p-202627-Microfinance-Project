# W3: Testing the repay flow end to end, two data bugs, and fixing a noisy score

## Starting point

The payments feature from W1 (wallet balance, live repayment, score
recompute in the same commit) had only been checked once, by hand. Before
building on it I ran it end to end properly: through the API with error
cases, then through the real UI in a browser, against a backed-up copy of
the database so the test payments could be undone afterwards.

## What the end-to-end test confirmed

Via the API (borrower 424): a payment moved the wallet by exactly the EMI,
cut the loan's outstanding balance, advanced the cycle (EMI #6 -> #7),
and stored a new score row. The error paths all behaved: paying someone
else's loan -> 403, viewing another borrower's due summary -> 403,
nonexistent loan -> 404, wallet too small -> 400 with the balance and the
amount due, no token -> 401. In the UI I logged in, went through the
demo payment-gateway sign-in, paid a loan, and checked the wallet, the
"Paid ... Late" banner, the new score and the database rows all agreed.
No console errors apart from the app's normal logged-out `/auth/me` 401s.

## Bug found: a loan with nothing owed was still payable

Loan 619 had a 0.00 outstanding balance but was still Active, and the
Repay page offered to charge a full EMI for it. Root cause was in the
synthetic data generator, not the payment code: it tracks the balance as
*principal only* (`principal - paid_total`) while every EMI includes
interest, so loans hit zero before their last cycle -- and the generator
only closed a loan if it reached zero *and* its final cycle. 64 loans were
affected.

**Fix:** the generator now closes any loan whose balance reaches zero; a
one-off idempotent migration (`migrate_close_paid_loans.py`) closed the 64
existing ones (second run closed 0); and the payment service skips loans
with nothing owed and closes a loan when its balance reaches zero.

## Bug found: a missed cycle stayed "due" forever

The cycle number was derived by counting only On_Time and Late events, so
a Missed or Partial event never moved the pointer. Loan 620's Missed
2026-08-21 row sat next to a computed due date of 2026-05-23, and the
cycle that had already been recorded as missed could never be cleared.
There were 2,071 Missed and 1,583 Partial events in the data.

**Fix:** every recorded event now resolves its cycle, so the pointer
advances past a Missed or Partial cycle. Loan 620 went from EMI #14 to
#18. I updated the formula in `API_CONTRACT_PAYMENTS.md` to match. One
consequence worth knowing: Active loans whose events already cover their
whole tenure, but which still carry a balance (196 of them), no longer
show as payable -- a missed cycle is treated as written off, not as
arrears to catch up. Making arrears payable would be a separate design
decision.

Re-ran the whole flow in the UI afterwards: Household (619) gone from the
list, Small business at EMI #18, payment took the wallet down by exactly
the EMI, database rows consistent.

## Investigation: the score went down (and up) after late payments

While testing I noticed a borrower's score moved in ways that didn't match
the payment: 852 -> 848 after one late payment, then 848 -> 860 after
another, including one 179 days overdue.

I tested it counterfactually without touching the database -- recompute
the score for the same borrower with one extra On_Time, Late or Missed
event added. For borrower 424, an On_Time payment, a Late one at 5 days and
a Late one at 179 days all gave the same -5. Across 271 SHG-linked
borrowers the *average* direction was right (On_Time +4.9, Late -3.1,
Missed -31), but per borrower it was unreliable: 19% saw an On_Time
payment *lower* their score, 17-21% saw Late score above On_Time.

Two causes:

1. **No monotonicity.** The XGBoost model was unconstrained and trained on
   only 474 people, so it fit noise: raising `late_rate` from 0.18 to 0.25
   *raised* one borrower's score (847 -> 864), and 200 average days late
   scored above 100.
2. **`n_repayment_events` as a feature.** It measures how long someone's
   history is, not how well they repay, and every payment of any kind
   bumps it by one -- one extra event moved a score by 5 points and the
   feature swung it by up to 87 points over a narrow range.

I also realised part of the 852 -> 842 I'd seen was my own loan-closing
migration changing `n_closed_loans` for 64 borrowers, leaving stored
scores stale until the next scoring run.

## Fix: monotone constraints, drop the length feature, retrain, rescore

Before changing the real model I compared variants in a scratch script
using 5-fold cross-validation, because a single 95-person holdout is too
small to trust: unconstrained 0.915 AUC, monotone 0.913, monotone without
`n_repayment_events` 0.916 -- accuracy unchanged, behaviour much better.

Applied it: `n_repayment_events` removed from the model's feature list
(still computed for the cold-start blend and anomaly check), monotone
constraints added in `train_scoring_model.py` (more on-time/savings/
attendance/peer repayment can only lower default risk; more late/partial/
missed or days late can only raise it), model retrained, then
`score_all` re-scored all 1,079 borrowers (history is kept -- new rows are
appended).

| | Before | After |
|---|---|---|
| On_Time payment lowers score | 19% | 0% |
| Late scores higher than On_Time | 17-21% | 5% |
| Missed scores better than On_Time | not measured | 0% (36% ties) |

## What I'd flag

- About 68% of borrowers see no change at all from a single extra On_Time
  payment: one event is too small to cross a split in a model trained on
  ~475 people. That is a data-size limit, not a bug.
- The remaining Late-above-On_Time cases (5%) are mostly legitimate: a
  late payment of fewer days than the borrower's average *lowers* their
  `avg_days_late`.
- Holdout AUC on the single 95-person split dropped 0.910 -> 0.900; the
  cross-validated numbers show no real difference.
- Fixed afterwards: `lender_name` came back null for every loan in the
  due-summary, because the generator deliberately seeded all ~1,650 historical
  loans with no lender ("pre-marketplace history"), so the repay page couldn't say
  who was being repaid. Backfilled by `migrate_loan_lenders.py` following the
  marketplace's own rules (an Approved-linked lender for SHG members, an
  independents-serving one for independents; deterministic by loan id, idempotent,
  live-flow loans untouched, 0 rule violations checked in SQL) and the generator
  now does the same. 38 loans whose SHG has no approved lender stay unattributed
  and show "Lender not recorded" instead of a blank.
- The mock payment gateway's `abc`/`123` credentials are hard-coded in the
  frontend -- fine for a demo, not for anything shown outside one.
