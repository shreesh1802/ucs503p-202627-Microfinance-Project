# Week 9 : Verification Pass Before the Final Report

# Does the Oversight View Still Add Up?

## Error:

Two data migrations and a model retrain landed in the same week, and the
admin dashboard sits downstream of all three. The portfolio overview had
moved since the figures quoted in the Prototype Stage report:

> Prototype Stage report:  1,619 loans, 315 defaulted, default rate 19.4%
> After the migrations:    1,640 loans,   309 defaulted, default rate 18.8%
>                          Active 736 | Closed 595 | Defaulted 309

Nothing was broken. But numbers I had already put in a submitted report
had changed, and "the data changed" is not an answer I would want to give
in a viva.

## Relevant Context

Three changes, each from a different part of the system:

``` text
migrate_close_paid_loans.py  -- closes Active loans whose
                                outstanding_balance <= 0.01
migrate_loan_lenders.py      -- attributes seeded loans to lenders
train_scoring_model.py       -- retrain with monotone constraints
```

The seed generator now applies the same close-paid rule when it builds
the database, so a regenerated dataset already reflects it. Reseeding and
counting shows what the first migration was for:

``` sql
select status, count(*) from loans group by status;
-- Active 736 | Closed 595 | Defaulted 309

select count(*) from loans
 where status='Closed' and outstanding_balance <= 0.01;
-- 595

select count(*) from loans
 where status='Closed' and outstanding_balance > 0.01;
-- 0
```

Every single Closed loan is closed *because its balance reached zero*,
not because it reached its final cycle. Under the old rule -- close only
on the last cycle **and** a zero balance -- all 595 of those sat in
`Active`, owing nothing and still payable, because the generator tracks
principal-only balances and they hit zero early.

## Key Observation

Checking invariants is a different exercise from checking numbers, and
only the first is repeatable when the data underneath keeps moving:

| Invariant | Result |
|---|---|
| Active + Closed + Defaulted = total loans | 736 + 595 + 309 = 1,640 |
| SHG-linked + independent = total borrowers | 659 + 420 = 1,079 |
| default rate = defaulted / total | 309 / 1,640 = 18.8% |
| best-scoring district carries the "High Trust" label | holds |
| every loan names a lender | **no -- 74 do not** |

The last row is the residue of the attribution migration. On the dataset
as regenerated today it placed 1,566 seeded loans with a lender and left
74 without one; those render through a fallback rather than a blank cell:

``` python
"lender_name": loan.lender.name if loan.lender else "Lender not recorded",
```

That is correct behaviour, not a defect -- but it is on screen, and I
would rather know why before an examiner asks.

The summary endpoint computes the whole breakdown per request instead of
storing it:

``` python
"n_loans": n_loans, "n_loans_defaulted": n_defaulted,
"n_loans_active": n_active, "n_loans_closed": n_closed,
"default_rate": round(n_defaulted / n_loans, 4) if n_loans else None,
```

which is why the identity survived a migration that rewrote a third of
the rows: there is no cached total to drift out of step.

## Solution

- Re-ran the test suite: 52 of 54 cases pass, the two failures being the
  known defects D-01 (all seeded borrowers share one password hash) and
  D-02 (401 where the specification says 403).
- Re-checked the admin analytics by hand after the retrain: district
  clusters still label by rank rather than by k-means index, the
  identities above hold, the model-health panel reports the retrained
  artifact against a population rescored by it, and the anomaly list
  still touches no score.
- Recorded the before/after portfolio figures and their cause, so the
  difference between the Prototype Stage report and the Final Report is
  explainable rather than merely survivable.

**Because**

A verification pass is not for confirming the screen looks fine. It is
for finding the questions an examiner could ask that I could not
currently answer -- and the honest finding this week is that a number
moving for a good reason looks, from outside, exactly like a number
moving because something broke.

Writing the invariants down converts that into a one-minute check every
time the data changes, instead of something I have to remember to be
suspicious about.

## What I would do next on this role

- Fix D-02 in `get_current_admin`; it is small, and it is the only
  defect on this role's own surface.
- Give the admin an audit trail before giving it any moderation action.
  A read-only console that quietly acquires write paths stops being
  oversight.
- Cache the score distribution. Recomputing it per request is fine for
  1,079 borrowers and stops being fine well before a real population.
