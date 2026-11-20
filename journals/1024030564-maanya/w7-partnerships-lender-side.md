# W7: Partnerships From the Lender's Side

## 1. Why a lender cares about SHGs at all

A lender does not reach SHG members directly. It reaches them through an
approved partnership with their group, which is what W3's eligibility rule
is built on. So partnership management is not an administrative screen for
a lender — it is how its addressable market is defined.

This week covered the lender's half of that flow.

## 2. Either side may ask; the other side answers

The link table records who started it:

```python
link = SHGLenderLink(shg_id=..., lender_id=..., status="Pending",
                     requested_date=date.today(),
                     notes=notes, initiated_by_role=initiated_by_role)
```

`initiated_by_role` exists so the interface can answer a question it
otherwise cannot: *may I decide this one?*

$$
\text{decidable by me} \iff \text{initiated\_by\_role} \neq \text{my role}
$$

A lender that proposed a partnership sees it as **awaiting the SHG**. A
partnership the SHG proposed appears in the lender's pending list with
approve and reject buttons.

Without that column the dashboard would have to guess, and the obvious
guess — show the buttons to whoever is looking — lets a lender approve its
own request and grant itself access to a group's members.

## 3. The two refusals

```python
if existing is not None:
    raise LinkageError(
        f"A link between SHG {shg_id} and lender {lender_id} already "
        f"exists (status={existing.status}). Use decide_link to change it.")
```

and

```python
if link.status != "Pending":
    raise LinkageError(f"Link {link_id} already decided "
                       f"(status={link.status})")
```

One pair, one link row. A second request cannot be filed on top of an
existing partnership, and a decided link cannot be re-decided — a rejected
partnership does not get quietly flipped to approved by a second click.

## 4. What approval actually changes

The moment a link becomes Approved, that SHG's members start appearing in
this lender's eligible-borrower list (subject to the score threshold).
Nothing else changes: no notification is sent, no offer is made, no data
is copied anywhere.

That is worth stating because the partnership looks like a relationship
and is really a visibility grant. Revoking it takes the members back out
of view and leaves any loans already made untouched — which is correct,
since a loan is a contract and a partnership is only an introduction.

## Because

The rule that the initiating side cannot decide its own request is the
only thing standing between "partnership" and "self-service access to
other people's members". It costs one column and one comparison.

Everything else in this flow — the duplicate check, the already-decided
check — exists for the same reason: a visibility grant should take two
parties agreeing, exactly once, on the record.
