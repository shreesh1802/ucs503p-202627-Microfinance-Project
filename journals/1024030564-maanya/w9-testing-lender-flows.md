# W9: Testing the Lender Flows, and What Is Still Missing

## 1. What I tested

The lender role has three paths that can create or refuse a commitment,
so those are the ones that had to be exercised deliberately rather than
clicked through:

| Flow | Case | Expected |
|---|---|---|
| Eligibility | borrower in an unlinked SHG | not listed |
| Eligibility | independent borrower, lender serves independents | listed |
| Eligibility | borrower below the score threshold | not listed |
| Eligibility | borrower with no score at all | not listed |
| Offer | amount above the lender's maximum | 400 |
| Offer | borrower not eligible for this lender | 400 |
| Offer | borrower accepts | Active loan created |
| Request | approve without a rate | 400 |
| Request | approve with a rate | Active loan, request closed |
| Request | decline a broadcast request | still Pending for others |
| Request | same lender declines twice | refused |
| Partnership | lender decides its own request | 403 |
| Partnership | duplicate request for the same pair | 400 |
| Partnership | decide an already-decided link | 400 |

All behaved as intended. The two that mattered most were the ones where
the wrong behaviour would have been invisible: a declined broadcast
request staying open for other lenders, and a lender being unable to
approve a partnership it had itself proposed.

## 2. What testing changed

Two things I had assumed were enforced turned out to be worth checking by
calling the endpoint directly rather than using the interface:

- The eligibility rule holds at the **endpoint**, not just in the list.
  Sending a borrower id the dashboard never showed still produces a 400,
  which is what makes the filter an access rule rather than a view.
- The score threshold is applied to the borrower's **latest** score. A
  borrower who was eligible last week and has since dropped below the
  threshold is no longer listed — the check is not cached anywhere.

## 3. What is still missing

Being honest about the limits of what the lender role currently does:

- **No negotiation.** An offer is take-it-or-leave-it; a borrower cannot
  counter, and a lender cannot revise. The schema has a `Withdrawn`
  status that no endpoint sets.
- **No reason on a decline.** A lender declining a request records the
  decline, not why. The borrower learns nothing they can act on, which
  sits badly next to a borrower dashboard built entirely around
  explaining decisions.
- **Reputation has no history.** It is computed on read, so a lender can
  see what their score is and not how it has moved. For a number meant to
  encourage cheaper lending, the trend is the useful part.
- **Partnerships cannot be revoked from the interface.** The model
  supports a decided link; the lender dashboard offers no way back.

## Because

The lender side was the part of this project where the rules were easiest
to state and easiest to get subtly wrong — a decline that closes a
request, an offer validated too late, a partnership that can be
self-approved. None of those would have raised an error.

Writing the cases down as a table before testing was what made them
visible: each row is a sentence about what the platform promises
participants, and a flow that fails one of them is not a bug in a form, it
is a broken promise.
