# Week 3 : Building the SHG Dashboard Frontend

# SHG Dashboard Implementation

## Objective

The third week focused on implementing the React interface for the SHG role
and connecting the dashboard to the SHG backend APIs.

## Relevant Context

The SHG dashboard needs to present group-level information, member credit
information, and lender relationships in a single interface.

The dashboard was therefore divided into separate sections:

- Group statistics
- Members
- Linked lenders

The information displayed in these sections is obtained from the backend
rather than being hardcoded in the React components.

## Key Observation

The dashboard needs to present both aggregated SHG information and
individual member information.

The group statistics section displays:

- Number of members
- Average member credit score
- Aggregate repayment rate
- Attendance rate

The member section requires a table containing the members associated with
the SHG. Each member is represented using:

- Member name
- Credit score
- Risk category

A reusable score-badge component is used to display the score and its
associated risk information consistently.

## Lender Section

The SHG dashboard also needs to support interaction with lenders.

The linked-lender section displays:

- Lender name
- Partnership status
- Request date
- Available partnership actions

The interface also provides a lender-selection mechanism through which an
SHG can select an available lender and create a partnership request.

## Solution

The React dashboard was structured into separate UI sections for statistics,
members, and lenders.

Backend API responses are used to populate the dashboard, keeping the
displayed information connected to the application's underlying SHG data.

Reusable UI components were used for repeated information such as member
credit-score and risk-status indicators.

The lender section was connected to the lender-related API operations so
that partnership information and requests could be represented in the SHG
interface.

## Because

Separating the dashboard into functional sections makes the SHG information
easier to consume while keeping different responsibilities of the interface
separate.

Using backend-provided data ensures that displayed statistics and member
information correspond to the application's stored data instead of
frontend-defined values.