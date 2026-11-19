# Week 6 : What an Anomaly Flag Is Allowed To Do

# Anomaly Review Panel

## Error:

Not a crash this week. The problem was a design question I had got
wrong in my own head, and it showed up as a request during review:
*"can we subtract points from the flagged borrowers automatically?"*

The honest answer is no, and the panel had to be built so that nobody
could reasonably assume otherwise.

## Relevant Context

The detector itself is an Isolation Forest over the behavioural
features:

``` python
model = IsolationForest(contamination=CONTAMINATION,
                        random_state=42, n_estimators=200)
```

Each flag carries a plain-language reason rather than only a score:

``` python
def _reason_for(row):
    reasons = []
    ...
    reasons.append("unusually large average lateness when late")
    if not reasons:
        reasons.append("behavioural pattern statistically unusual "
                       "relative to peers (see feature values)")
    return "; ".join(reasons)
```

Rows are listed by anomaly score ascending, because scikit-learn's
convention makes the *more negative* score the more unusual point.

## Key Observation

Three properties of the detector decide what the flag may mean:

1. **`contamination` is an assumption, not a measurement.** It fixes
   the proportion of the population that comes back flagged. Set it to
   5% and roughly 5% is flagged -- on clean data as readily as on dirty
   data. The flag count is therefore not evidence that anything is
   wrong.
2. **Unusual is not the same as bad.** A borrower who repays early
   every single cycle is as far from the centre of the distribution as
   one who pays erratically, and the model has no notion of which
   direction is undesirable.
3. **The model never sees repayment *outcomes*.** It clusters
   behaviour. Treating its output as a risk verdict would be using a
   model to answer a question it was not asked.

Put together: a flag is a prompt to look, and nothing more. If it
silently moved a score, the system would be penalising people for
being statistically unusual, which is not a thing an outlier detector
is entitled to do -- and the borrower's SHAP explanation would not even
be able to say why their score dropped, because the anomaly flag is not
a model feature.

## Solution

The panel states its own limits, in the UI copy and in the router
docstring, so the constraint survives the next person reading the code:

- flags are presented as *"a prompt for review, not an automatic
  penalty"*;
- no code path from `anomaly_flags` to `credit_scores` exists, and the
  score pipeline does not read the table at all;
- **Re-run detection** (`POST /api/anomalies/run`) recomputes flags
  from data that already exists -- it creates no business record, which
  is why it is one of the two compute actions an otherwise read-only
  admin is allowed;
- the reason string is shown next to every row, because a bare score
  tells a reviewer nothing they can act on.

One UI detail cost me time: after clicking **Re-run detection** the
table still showed the previous flags, because the component was not
refetching. Added a `reload()` after the POST resolves, plus a
disabled/"Running..." state, since the detector takes a visible moment
on the full population and an idle-looking button invites a second
click.

**Because**

The dangerous version of this feature is the one that works. An
automatic penalty attached to an unsupervised model is easy to build,
looks decisive in a demo, and is wrong in a way nobody notices until a
real person is refused a loan for a reason nobody can explain.

Keeping the human in the loop costs one click and leaves the
responsibility where it belongs.
