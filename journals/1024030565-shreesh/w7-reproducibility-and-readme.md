# W7: Making the project reproducible by someone who is not me

## Starting point

Everything in the repository worked on my machine, which is the weakest
form of working there is. With the evaluation ahead and a final report to
write, the question became: if an examiner clones this at 9 a.m., can they
have it running by 9.10, and will they get the same numbers we quote?

The honest answer was no, for three different reasons.

## What was missing

**The run instructions assumed knowledge.** The README said how to start
the API and the frontend, but not that the database has to be generated
first, nor that the model artifacts have to exist before the API can serve
a score. Someone following it literally got a running server and empty
dashboards.

**The migrations were undocumented.** Three one-off scripts exist —
closing fully-paid loans, attributing seeded loans to lenders, and the
auth/payments schema migrations — and nothing told a new reader when to
run them or whether running them twice was safe. (They are idempotent,
which is exactly the kind of fact that is worthless if it is only in the
author's head.)

**Order mattered and was unstated.** `data_gen` → `train_scoring_model` →
`score_all` is not a sequence anyone can guess, and running it in the
wrong order fails in ways that look like bugs: scoring with no model,
training with no data.

## Fix

Rewrote `code/README.md` around the path a stranger actually takes:

1. install dependencies,
2. generate the synthetic population (seed fixed at 42, so the numbers in
   the report are reproducible),
3. train the scoring model,
4. score the whole population,
5. run the API and the frontend,
6. log in with the demo accounts — listed, per role.

Each one-off migration is listed with what it does, when it is needed, and
the fact that re-running it is harmless.

## The reproducibility point

The seed matters more than it looks. Every figure quoted in the reports —
population counts, loan totals, the default rate, holdout accuracy — comes
from a dataset generated with `seed=42`. If the generator changes, those
numbers move, and a report that cites them becomes wrong without anyone
touching the report.

That has already happened once: the November changes to the generator
(closing fully-paid loans, attributing loans to lenders) shifted the loan
status breakdown and the default rate from what the Prototype Stage report
quotes. Not an error in either document — but the Final Report has to
state which dataset its numbers came from, or the two reports simply
contradict each other.

## Because

A project that only runs in the hands of the person who wrote it has not
been delivered, it has been demonstrated. The difference shows up at
exactly the wrong moment: when someone else, under time pressure, tries to
make it work.

Writing the README properly took an afternoon and is the single change
most likely to matter to whoever opens this repository next — including us
in four weeks, when the details have gone.
