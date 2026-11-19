# Week 9 : Final Testing of the SHG Module

# Verification Before Submission

## Objective

The final week was spent checking that the SHG module still behaves
correctly after the rest of the platform changed around it, and recording
what it does not yet do.

## Relevant Context

Three things changed elsewhere during the project that the SHG module
depends on: the scoring model was retrained, the loan data was migrated,
and the session handling was reworked when the roles were separated. None
of those are SHG code, and all of them feed the SHG dashboard — member
scores, group repayment rates, and who may log in to see them.

## Key Observation

The checks that mattered were the ones where a wrong answer would still
have rendered correctly.

**Member list access.** Called the SHG endpoints as each role:

| Caller | Expected | Result |
|---|---|---|
| the SHG itself | members shown | correct |
| lender with an Approved link | members shown | correct |
| lender with a Pending link | summary only | correct |
| a member of the group | summary only | correct |
| no token | refused | correct |

**Partnership decisions.** A link the SHG created cannot be approved by
the SHG; a link already decided cannot be decided again; a duplicate
request for an existing pair is refused. All three held.

**Group statistics after the retrain.** The average member score moved,
because every member was rescored. The repayment and attendance rates did
not, because they are computed from records the retrain does not touch.
That is the correct result, and checking it was the only way to know the
dashboard was reading the latest score per member rather than a stale one.

## Solution

The module is left in a state where each displayed number has a stated
source: aggregates from GROUP BY queries over member records, member
scores from the latest row per member, partnership rows from the link
table with their initiator recorded.

## What the module does not do

Recording these honestly, since they are the obvious questions:

- **A partnership cannot be revoked from the SHG dashboard.** The link
  model supports a decided state, but the interface offers no way for a
  group to end an approved relationship.
- **Attendance and savings are read-only.** They come from the seeded
  data; there is no screen through which an SHG records a meeting or a
  deposit, which a real deployment would need first.
- **No member management.** Members cannot be added to or removed from a
  group through the interface.
- **The aggregate rates have no minimum group size.** A group with two
  members shows a repayment rate computed from two people, presented the
  same way as one computed from thirty.

## Because

The SHG is the part of CreditSetu that carries the trust the whole
dual-path design borrows from: the group's repayment record is what gives
a new member a starting score better than a stranger's. That makes the
group's statistics load-bearing rather than decorative, and it is why
this week was spent confirming where each of them comes from rather than
confirming that the page still loads.

Listing what the module cannot do belongs in the same exercise. A
dashboard that shows a partnership it cannot end, or a rate it cannot
qualify, is still useful — but only if everyone knows that is what they
are looking at.
