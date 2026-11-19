# Week 6 : Group Statistics and What They Actually Measure

# SHG Aggregate Metrics

## Objective

The sixth week focused on the group-level numbers shown on the SHG
dashboard — aggregate repayment rate, aggregate attendance rate, member
count and average member credit score — and on being precise about what
each one is computed from.

## Relevant Context

An SHG's statistics are not stored on the group. They are derived from
records belonging to its members:

- repayment behaviour comes from the repayment events of the members'
  loans,
- attendance comes from `shg_attendance_records`,
- savings regularity comes from `savings_records`,
- the average score comes from each member's latest credit score.

Each of these lives at a different level of the data model. Attendance and
savings are recorded per member per period; repayment events belong to a
loan, which belongs to a member; the credit score is one append-only row
per scoring run.

## Key Observation

Two definitions had to be settled before the numbers could be trusted.

**The latest score per member, not every score.** `credit_scores` is
append-only, so a member who has been rescored several times has several
rows. An average taken across all rows is an average over the scoring
*history*, weighted by how often each member happened to be rescored. The
group average has to be taken over one row per member — the most recent
one.

**Aggregate rates are computed in SQL, not per object.** The list endpoint
computes attendance and repayment rates with GROUP BY queries, one row per
SHG, rather than walking each group's members and their loans in Python.
The comment in `shgs.py` records why these queries exist instead of the
equivalent model properties, and the pattern is worth keeping in mind for
any group-level metric added later: a property that reads naturally in
code can be a large number of queries when it is called once per row of a
list.

A third point is about meaning rather than mechanics. The aggregate
repayment rate describes the group as a whole; it is also the input to
each individual member's bootstrap score. The same number therefore plays
two roles — a statistic on a dashboard, and a prior in the scoring engine
— and changing how it is defined would change people's scores.

## Solution

The group statistics section shows the four aggregates with the member
count beside them, so a rate computed from three members is not read as
though it described thirty.

The member table lists each member with their latest score and risk
category through the shared score-badge component, which keeps the
group-level and member-level views of the same information consistent.

## Because

A group statistic is an average over people, and an average is only
meaningful if the set being averaged is stated. "Average member score"
over all score rows and over the latest score per member are different
numbers, and only one of them is about the members.

Taking the trouble to define each aggregate precisely also protects the
scoring engine, because the SHG's repayment rate is not only displayed —
it is what gives a new member their starting score.
