# W8: Assembling the Lender Dashboard

## 1. What a lender needs on one screen

By this week every lender-side endpoint existed and none of them were
arranged into anything a person could use. The dashboard had to answer
four questions without scrolling:

1. How do I look to borrowers? → reputation score and its explanation
2. Who can I lend to? → eligible borrowers
3. Who has asked me? → incoming loan requests
4. Which groups can I reach? → partnerships, pending and approved

## 2. The cap that had to go in

The eligible-borrower table rendered every eligible borrower. For a lender
that serves independents, that is several hundred rows of names and
scores — a list nobody reads, on a screen that exists to support a
decision.

Capped the table at 25 rows with a "showing top N of M" note, ordered by
score. The count still tells the lender the real size of their
addressable market; the table shows the part of it they might act on.

This is a display decision rather than a data one: the endpoint still
returns what it returns, and the cap lives in the view.

## 3. A field that was missing from the loan rows

While building the view of a lender's existing loans, every row came back
with no lender name attached. The cause was in the seeded data rather
than the lender code — historical loans were generated as
"pre-marketplace" history, with no lender recorded at all — and a
migration later attributed most of them following the marketplace's own
rules.

The loans it could not place render through a fallback instead of an empty
cell:

```python
"lender_name": loan.lender.name if loan.lender else "Lender not recorded"
```

Worth knowing from the lender side, because that string is visible in the
interface and it means *this loan predates the marketplace*, not *this
loan has lost its lender*.

## 4. Reputation on the borrower's screen too

The reputation score from W4 is shown twice: on the lender's own
dashboard, where it is feedback, and next to each suggested lender on the
borrower's screen, where it is guidance.

Same number, two audiences. The explanation sentence matters more on the
borrower's side — "rates below the platform average, active in the
marketplace" is a reason to choose a lender; the bare 68 is not.

## Because

Four endpoints and a dashboard are not the same project. The endpoints
answer questions; the screen decides which questions a lender is asked to
think about, and in what order.

The cap is the clearest example: nothing was broken, the data was correct,
and the page was unusable. Fixing it required no backend change at all —
only deciding what a lender is actually here to do.
