# Week 8 : Model Health After a Retrain

# Reading Numbers That Moved

## Error:

The model was retrained during the scoring work, and the health panel
started disagreeing with itself:

> Model version: v2 (from the newest credit_scores row)
> Last computed: the artifact's file date -- today
> Holdout accuracy / AUC: the new artifact's values
> Borrowers scored: 1,079 / 1,079
> Score distribution: unchanged from before the retrain

The distribution could not be right. If every borrower had been
rescored by a different model, the bands had to move.

## Relevant Context

The panel reads two sources on purpose, because the artifact does not
carry everything:

``` python
meta_path = ARTIFACTS_DIR / "scoring_meta.json"
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

`last_computed` is the artifact's own modification time and
`model_version` comes from the newest score actually stored -- both
facts about the system rather than values we write about ourselves.

## Key Observation

The retrain had produced a new artifact. It had **not** rescored the
population. So the panel was telling the truth in a misleading way:
the metadata described the model on disk, while the distribution
described scores computed by the *previous* model. Every number was
individually correct and the panel as a whole was wrong.

The second finding came from checking the distribution query itself:

``` sql
select cs.score
from credit_scores cs
join (
    select individual_id, max(calculated_date) as max_date
    from credit_scores group by individual_id
) latest on latest.individual_id = cs.individual_id
        and latest.max_date = cs.calculated_date
```

That join is load-bearing. `credit_scores` is append-only, so a plain
scan would count a borrower once per rescore -- and a borrower rescored
five times would be five rows in the histogram. The panel would then
be describing the score *history*, not the people. With the retrain
adding a second row for everyone, this is exactly when the mistake
would have started showing.

## Solution

- Batch-rescored the population after the retrain, so the stored
  scores and the stored artifact describe the same model, and the
  distribution means what the panel says it means.
- Kept `model_version` sourced from the newest score row rather than
  from the artifact, so the panel reports what was actually used in
  production, not what is sitting on disk waiting to be used. The
  mismatch above is a condition worth being able to see.
- Left every artifact read as `.get()`:

``` python
"n_training_rows": meta.get("n_training_rows"),
"holdout_accuracy": meta.get("holdout_accuracy"),
"holdout_auc": meta.get("holdout_auc"),
```

so a key the next retrain does not write renders blank instead of
raising a 500 -- the same lesson as the `trained_at` KeyError in W4.

**Because**

A dashboard that mixes sources has to be read as a whole, not as a
list of independent tiles. Here the tiles came from two different
points in time, and nothing on the screen said so.

The underlying rule I keep relearning on this role: when a panel's
numbers can disagree, the useful design is the one that lets the
disagreement be *visible* rather than the one that hides it by reading
everything from a single convenient place.
