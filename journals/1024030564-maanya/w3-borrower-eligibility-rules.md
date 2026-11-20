# W3: Who a Lender Is Allowed to See

## 1. The question behind the eligibility rule

The lender dashboard lists "eligible borrowers". The third week went into
what that phrase is allowed to mean, because it is simultaneously a
product feature and an access-control boundary.

A lender must not be able to browse the whole population. The rule that
decides visibility is therefore the same rule that decides privacy.

## 2. The rule as implemented

A lender may see an individual when:

$$
\text{visible} =
\begin{cases}
\text{SHG member} \wedge \text{Approved link with this lender}\\
\text{independent} \wedge \text{lender serves independents}
\end{cases}
$$

and, on top of that, the individual's latest credit score clears the
lender's own threshold:

```text
latest_score >= lender.min_score_threshold
```

The approved links are collected once, as a set, before the scan:

```python
approved_shg_ids = {
    row.shg_id for row in db.query(SHGLenderLink.shg_id)
    .filter(SHGLenderLink.lender_id == lender_id,
            SHGLenderLink.status == "Approved")
    .all()
}
```

Pending and Rejected links are invisible here. A partnership that has been
requested but not approved grants nothing — which is the whole point of
the approve/reject design on the SHG side.

## 3. The case that needed a decision

What about a borrower who has **no score yet**?

Three options existed: treat them as eligible, treat them as ineligible,
or exclude them. The implementation excludes them:

> Individuals with no score yet (score never computed) are excluded --
> they need to be scored before a lender can consider them, not silently
> treated as either eligible or ineligible.

Treating an unscored borrower as eligible would put someone in front of a
lender with no basis for the recommendation. Treating them as ineligible
would be a judgement the system has not earned — it has no information,
which is not the same as negative information.

Excluding them says the honest thing: this borrower cannot be assessed
yet.

## 4. What this means for the lender's view

Two lenders looking at the same platform see different populations, and
neither sees all of it. That is correct behaviour, but it has a
consequence worth noting for the demonstration: a lender with no approved
SHG links and `serves_independents = false` sees an empty list, and the
empty list is the system working, not a bug.

## Because

An eligibility filter written as a product convenience ends up being the
only thing standing between a lender and the entire borrower population.
Writing it as an access rule first — and only then as a list on a
dashboard — keeps the two from drifting apart.
