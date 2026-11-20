# W6: Deciding a Loan Request Without Closing It for Everyone Else

## 1. The queue a lender actually sees

A borrower's request is either **broadcast** to every eligible lender or
**targeted** at one. The lender's incoming queue therefore contains
requests addressed to it directly, plus broadcast requests it is eligible
for — and nothing else.

This week went into what happens when a lender acts on one.

## 2. Approve

Approval requires a rate:

```text
POST /api/loan-requests/{id}/approve   { "interest_rate": 12.5 }
```

Approving without one returns 400. The rate cannot be inferred from the
lender's base rate, because the whole point of the marketplace is that a
lender may price an individual loan differently from its advertised
default.

On approval the request closes and an **Active loan** is created with its
principal, rate, tenure and an outstanding balance. That loan is what the
borrower's repay page then works against.

Eligibility is re-checked at the moment of the decision, not taken from
when the request was made. A borrower's score can move between the two —
and the decision has to be made against what is true now.

## 3. Decline, and the mistake I nearly made

My first version treated a decline as the end of the request:

```text
status: Pending -> Declined
```

That is wrong for a broadcast request. The borrower asked *the platform*,
not one lender. If the first lender to look at it declines and the request
closes, every other eligible lender loses the chance to approve, and the
borrower is refused by a queue rather than by a decision.

$$
\text{Decline (broadcast)} \Rightarrow
\text{hidden from this lender},\;
\text{still Pending for the others}
$$

So a decline is recorded against the *pair* — this lender, this request —
and the request stays Pending. The same lender cannot decline it twice,
which is checked rather than assumed.

For a targeted request, a decline does end the matter for that lender, and
the borrower can retarget the request elsewhere.

## 4. What the lender sees afterwards

A declined request leaves the lender's queue, because leaving it there
means every lender works through a list that only grows. It does not
vanish from the system — the decline is a record, and a borrower whose
request has been declined by four lenders is information the platform
holds even if no single lender sees it.

## Because

The difference between "I decline" and "this request is refused" is the
difference between one lender's decision and a platform-level verdict. The
first is what a lender is entitled to make. The second is not something
any single participant should be able to do by clicking a button on their
own screen.

Getting that wrong would not have produced an error. It would have
produced a system where being looked at by the wrong lender first is the
difference between getting a loan and not.
