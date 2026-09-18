# Week 4 : KeyError on a Field the Artifact Never Had

# Model Health Panel

## Error:

Error encountered on `GET /api/admin/model-health` while
building the admin model-health card.

> File "app/routers/admin.py", line 61, in model_health
>     "last_computed": meta["trained_at"],
>                      ~~~~^^^^^^^^^^^^^^
> KeyError: 'trained_at'

## Relevant Context

I wrote the endpoint expecting the scoring artifact to
carry a training timestamp and a model version. It does
not. The real keys in `artifacts/scoring_meta.json` are:

``` python
>>> json.load(open("artifacts/scoring_meta.json")).keys()
dict_keys(['feature_columns', 'impute_medians',
           'shap_expected_value',
           'trained_on_shg_linked_only',
           'min_repayment_events', 'n_training_rows',
           'holdout_accuracy', 'holdout_auc'])
```

There is no date and no version anywhere in the file.

## Key Observation

The obvious fix -- add `trained_at` and `version` to the
artifact -- has two problems. Nothing can be displayed
until the model is retrained, and both values would then
be numbers we write about ourselves rather than facts
about the system.

Both facts already exist elsewhere, as by-products of work
that actually happened:

- when the artifact was last written -> its own
  modification time on disk;
- which model produced the newest score in production ->
  `CreditScore.model_version` on the most recent row.

## Solution

``` python
# app/routers/admin.py
meta_path = ARTIFACTS_DIR / "scoring_meta.json"
meta = {}
last_computed = None
if meta_path.exists():
    with open(meta_path) as f:
        meta = json.load(f)
    last_computed = date.fromtimestamp(
        os.path.getmtime(meta_path)).isoformat()

latest_score_row = (
    db.query(CreditScore)
      .order_by(CreditScore.calculated_date.desc()).first()
)
model_version = (latest_score_row.model_version
                 if latest_score_row else None)
```

Everything else on the card is read from the artifact with
`.get()`, so a missing key renders as blank instead of
raising:

``` python
"n_training_rows": meta.get("n_training_rows"),
"holdout_accuracy": meta.get("holdout_accuracy"),
"holdout_auc": meta.get("holdout_auc"),
```

The score distribution needed one more correction. My
first query counted every row in `credit_scores`, which
counts a borrower once per rescore. It has to be the
*latest* score per borrower:

``` sql
select cs.score
from credit_scores cs
join (
    select individual_id, max(calculated_date) as max_date
    from credit_scores group by individual_id
) latest on latest.individual_id = cs.individual_id
        and latest.max_date = cs.calculated_date
```

**Because**

`meta["k"]` asserts that the file has a shape. Reading a
file you did not write is exactly the place where that
assertion is worth the most and costs the least, so those
reads use `.get()` and the panel degrades to blanks rather
than a 500.

The distribution bug is the same mistake in a different
place: a plain join over an append-only history table
silently answers a question about *score rows* when the
card is asking about *people*.

## Also logged this week

Testing the admin gate with the other roles' tokens: no
token gives 401 everywhere, and a borrower token is
refused on every admin-only endpoint, so nothing leaks.
But the refusal comes back as **401** from
`get_current_admin`, whereas our specification says a
valid token in the wrong role must be **403**. Access is
still denied; the frontend just cannot tell "logged out"
from "not allowed". Raised as defect D-02 rather than
patched in a hurry, because the clean fix belongs in the
dependency: check whether the token matches any other
role's live session, return 403 if it does and 401 only
when there is no valid session at all.
