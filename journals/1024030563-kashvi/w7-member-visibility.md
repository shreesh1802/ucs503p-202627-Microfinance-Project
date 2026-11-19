# Week 7 : Who May See an SHG's Members

# Member Visibility Across Roles

## Objective

The seventh week focused on a single question with four different
answers: what does each role see when it looks at an SHG?

The SHG module is the one place in the platform where the same record is
visible to all four roles, so the rules had to be written down rather than
inferred from whichever endpoint was being built at the time.

## Relevant Context

Four callers can reach an SHG record:

- the **SHG itself**, logged in as that group,
- a **lender**, which may or may not hold an approved partnership,
- a **borrower**, who may be a member of that group,
- the **admin**, who has read access across the platform.

The member list is the sensitive part. It associates named individuals
with their credit scores and risk categories, which is exactly the
information the rest of the platform is careful about.

## Key Observation

The rules that emerged are not symmetrical, and each one has a reason:

| Caller | Group statistics | Member list |
|---|---|---|
| The SHG itself | yes | yes |
| Lender with an Approved link | yes | yes |
| Lender without one | yes (public summary) | no |
| Member of the group | yes | **no** |
| Admin | yes | yes (read-only) |

The row that needed the most thought is the member one. A borrower can see
their own group's statistics — the size, the repayment rate, the
attendance rate — because those describe a group they belong to and
contribute to. They cannot see the member list, because that would mean
every member of every SHG can read their neighbours' credit scores.

The group's aggregate is information about the group. The member list is
information about other people.

A lender without a partnership sees the same public summary a borrower
sees. That is deliberate: a lender has to be able to evaluate whether a
group is worth partnering with before the partnership exists, and the
aggregate statistics are what that evaluation is made from. The members
only become visible when both parties have agreed.

## Solution

The endpoint takes the caller from the session and shapes the response
accordingly, rather than returning everything and leaving the interface to
hide what should not be shown. A lender whose link is Pending receives
the summary without the member list — not an empty list, and not a list
the frontend chooses not to render.

The SHG dashboard itself shows the full member table, since the group is
looking at its own members.

## Because

A response shaped by the caller cannot leak through a change of interface.
If the member list were sent to every caller and hidden in the view, the
data would still be in the browser, and any future screen — or anyone
opening the network tab — would have it.

The asymmetry between a group's aggregate and its member list is the
whole privacy design of this module in one sentence: a member consents to
being counted, not to being listed.
