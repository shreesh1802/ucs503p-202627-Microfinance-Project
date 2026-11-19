# W5: The borrower's own view — history, explanation, and tips

## Starting point

The borrower dashboard has one job the other three do not: it is the only
screen a non-technical person is meant to read on their own. A lender can
be trained; a borrower gets one look. So this week was spent on the three
panels that have to carry meaning without explanation — score history,
the SHAP breakdown, and the improvement tips.

## Bug: the score history ran backwards

The history chart plotted the score rows in the order the API returned
them, which is newest first. The x-axis therefore ran from today back to
the first score, so a borrower whose score had steadily *improved* saw a
line sloping down.

Nobody reads an axis before they read a slope. The one fact the chart
exists to convey — "this is going up" — was inverted for every borrower
on the platform.

**Fix:** order ascending by `calculated_date` before plotting. Trivial
change, and a reminder that a chart's default is whatever order the query
happened to produce, which is a property of the database, not of the
story being told.

## The explanation panel

The SHAP contributions are stored per score, in score points, and drawn
as a waterfall. Two decisions were worth making carefully:

- **Anchor on the population baseline, not the floor.** Allocating the
  contributions as a share of `score - 300` makes the explanation almost
  empty for exactly the borrowers scoring near 300 — the people who most
  need to know what is wrong. Measuring against the model's own baseline
  prediction keeps the breakdown meaningful at both ends.
- **Name the features in plain language.** `avg_days_late` is not a
  phrase anyone uses. The panel shows what the feature means in the
  borrower's own terms, with the sign and the size of its effect.

## Improvement tips

The tips are generated from the *negative* contributions only, capped at
five. The constraint I settled on: a tip must describe an action the
borrower can take, not a fact about them. "Your SHG's repayment rate is
low" is not actionable by one member; "pay your instalments on time — late
payments are currently costing you the most points" is.

Some features cannot produce a tip at all for this reason — the SHG peer
rate and the district are about where someone is, not what they do — so
they are excluded from the tip generator even though they move the score.

## Because

The dual-path design exists to be explainable. If the chart points the
wrong way and the breakdown collapses to nothing for the lowest scores,
the explanation is decoration — and a decorative explanation is worse than
none, because it implies a transparency that is not there.

The test I kept applying: could a borrower read this screen and know what
to do differently next month? If not, the panel is not finished.
