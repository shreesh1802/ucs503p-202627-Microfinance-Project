# Week 8 : Partnership Decisions From the Group's Side

# SHG-Lender Links in the SHG Dashboard

## Objective

The eighth week completed the SHG half of the partnership workflow: the
group's view of its lender relationships, and the decisions it is entitled
to make on them.

## Relevant Context

A partnership between an SHG and a lender is one row with a status —
Pending, Approved or Rejected — and a record of which side created it:

```python
SHGLenderLink(shg_id=..., lender_id=..., status="Pending",
              requested_date=date.today(),
              notes=notes, initiated_by_role=initiated_by_role)
```

The SHG dashboard needs that row twice over: once as a list of existing
relationships, and once as a queue of decisions waiting for the group.

## Key Observation

The group's own list divides into three kinds of row, and they need
different treatment in the interface:

1. **Approved** — the lender can see this group's members, and those
   members can be approached. Nothing to decide.
2. **Pending, requested by the lender** — the group has a decision to
   make, and approve/reject belong on this row.
3. **Pending, requested by the SHG** — the group is waiting on the lender.
   No buttons; showing them here would let the group approve its own
   request.

Distinguishing 2 from 3 is only possible because `initiated_by_role` is
stored. Without it the dashboard would have to show the same actions on
every pending row, and the approve button on a request the group itself
made would grant that group's members to a lender who never agreed to
take them.

The service refuses the invalid cases regardless of what the interface
offers:

```python
if link.status != "Pending":
    raise LinkageError(f"Link {link_id} already decided "
                       f"(status={link.status})")
```

so a decided partnership cannot be re-decided, and a second request for a
pair that already has a link is refused rather than creating a duplicate.

## Solution

The dashboard's lender section shows every link with its status, the date
it was requested, the date it was decided where applicable, and actions
only on the rows the group is entitled to act on.

Below it sits the lender-selection control, through which the group can
propose a new partnership to a lender it is not yet linked to. Lenders
that already have a link with this group are excluded from that list,
which prevents the duplicate request before it is made rather than
reporting an error afterwards.

## Because

What an approval actually grants is visibility of the group's members to
that lender — the same member list the previous week established is not
shown to members themselves. It is the most consequential action the SHG
role can take, and it is a single button.

Everything in this week's work is therefore about making sure that button
appears only on rows where pressing it means two parties agreed:
the stored initiator, the service-level checks, and a selection list that
cannot produce a duplicate.
