# W5: Offers — the Lender's Side of the Marketplace

## 1. Two directions, one marketplace

By this week the borrower could send a request to a lender. The reverse
direction was missing: a lender who looks at the eligible-borrower list
and wants to approach someone directly.

That is the loan offer, and it is the only flow in the system that a
lender starts.

## 2. The shape of an offer

```text
POST /api/offers        lender proposes an amount and a rate
GET  /api/offers        the offers relevant to the caller
POST /api/offers/{id}/respond    borrower accepts or rejects
```

An offer carries the lender, the borrower, the principal, the rate being
offered and its status:

$$
\text{Proposed} \rightarrow
\begin{cases}
\text{Accepted} \rightarrow \text{Active loan}\\
\text{Rejected}
\end{cases}
$$

Acceptance is what creates the loan. Until then the offer is a proposal
and nothing has been lent.

## 3. The checks that run before an offer exists

Two rules are enforced when the offer is made, not when it is accepted:

1. **The borrower must be eligible for this lender** — the same rule as
   the dashboard list (an approved SHG link, or an independent borrower
   and a lender that serves them, plus the score threshold). Without this
   check, a lender could offer to anyone by sending the borrower's id
   directly to the endpoint, which would make the eligibility filter a
   frontend decoration.
2. **The amount must be within the lender's maximum loan amount.** A
   lender cannot offer more than it has declared it lends.

Both return 400 with a reason rather than silently clamping the value.
Clamping would be worse than refusing: the lender would believe they had
offered one amount while the borrower saw another.

## 4. What the borrower sees

The offer appears on the borrower's dashboard with the lender's name, the
amount, the rate, and the lender's reputation score from W4 — so the
decision the borrower is being asked to make comes with the information
needed to make it.

A rejected offer does not disappear from the lender's view. The lender
should be able to see that an approach was made and declined, otherwise
the same lender re-offers the same borrower indefinitely.

## Because

The temptation with an offer flow is to make acceptance the moment where
everything is validated, because that is where money moves. But by then
the borrower has already been shown a proposal, and withdrawing it at
acceptance time means the system showed them something it was never
prepared to honour.

Validating at creation keeps the rule in one place: if an offer exists, it
was legitimate when it was made.
