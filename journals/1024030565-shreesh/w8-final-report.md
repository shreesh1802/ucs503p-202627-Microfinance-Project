# W8: Writing the Final Report from what the system actually does

## Starting point

The Prototype Stage report was written in a hurry in W2 and described a
system that was still moving. The Final Report has to describe one that
has stopped — and every number in it has to come from a run somebody
actually did, not from the previous report.

So the first task was not writing. It was deciding which claims could
survive being checked.

## Re-deriving the figures

Worked through the report's claims one at a time, re-running what each
depends on:

- **Population**: taken from the demonstration database the system
  actually runs on, and labelled "at the time of writing". A fresh seed
  with the current generator gives slightly different counts, because the
  generator itself changed in November.
- **Loan status breakdown and default rate**: these moved since the
  Prototype Stage report, because the generator now closes fully-paid
  loans and attributes historical loans to lenders. The Final Report
  quotes the current dataset and says so, rather than silently carrying
  the old figures forward.
- **Model performance**: re-measured after the monotone retrain rather
  than reused.
- **The live journey**: re-run end to end — request, approval, repayment,
  rescore — and the report quotes that run.

Anything I could not re-derive came out of the report. That removed two
sentences I liked and could not substantiate.

## Structure

Built on the TIET template, with the figures carried over from the
prototype stage (use case, class, activity, swimlane) and a note in the
text wherever the system has changed underneath them since — the 16
features that are now 15, and the wallet rule that is now per loan.

`references.bib` collects the sources properly instead of the hand-written
bibliography the earlier draft used — XGBoost, SHAP, Isolation Forest,
k-means, PBKDF2, the UML specification.

## What the report says that the prototype one did not

The defects. D-01 (all seeded borrowers share one password hash) and D-02
(401 where the specification says 403) are both in the Final Report with
their severity and recommended fix, along with the limitations that are
design decisions rather than bugs: shared demo passwords, the
hard-coded mock gateway login, the fact that score history is short
because the batch scorer has only been run a handful of times.

The argument for including them: an examiner who finds a defect we did not
mention concludes we did not test. An examiner who finds one we listed,
with a fix proposed, concludes we did.

## Because

The temptation in a final report is to describe the system as designed
rather than as built, because the design is tidier and the build has
edges. But the edges are the evidence of engineering — the monotone
constraint exists because the score misbehaved, the per-loan check exists
because the aggregate one blocked affordable payments, the storage
listener exists because a logged-out tab kept rendering.

A report that hides those reads as a specification. One that includes them
reads as a project.
