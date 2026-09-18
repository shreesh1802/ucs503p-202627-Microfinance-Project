# Week 2 : Building the SHG Backend API Layer

# SHG Backend APIs

## Objective

The second week focused on implementing the backend interface required by
the SHG dashboard and defining how SHG-specific information would be
retrieved while maintaining role-based access restrictions.

## Relevant Context

The SHG dashboard requires information about the group itself, its members,
group-level credit statistics, and its relationships with lenders.

Instead of allowing the frontend to directly access the database, these
operations were exposed through FastAPI routes.

The main SHG operations were:

- `GET /api/shgs`
- `GET /api/shgs/{shg_id}`
- `GET /api/shgs/{shg_id}/lenders`
- `POST /api/shgs/{shg_id}/link-lender`

## Key Observation

The dashboard required more than basic SHG profile information. It also
needed calculated group-level values such as:

- Actual member count
- Average member credit score
- Aggregate repayment rate
- Aggregate attendance rate

These values are better provided by the backend so that the frontend can
consume already-structured SHG data instead of performing database-level
calculations itself.

Another important observation was that the `shg_id` supplied by a client
cannot be treated as sufficient authorization. The application contains
multiple roles, so access to an SHG resource has to be checked against the
authenticated user's role and associated SHG.

## Solution

The SHG router was structured around separate endpoints for retrieving SHG
information, retrieving linked lenders, and creating lender-link requests.

Role-based access checks were incorporated into the backend so that an
authenticated SHG user can access its own SHG information without gaining
access to unrelated SHGs.

The backend therefore acts as both the data interface for the React
dashboard and the enforcement point for SHG-level access restrictions.

## Because

Keeping these checks in the backend prevents the frontend from being the
only layer responsible for restricting access.

Providing group-level statistics through the API also keeps the React
dashboard focused on displaying the data rather than reproducing backend
data-processing logic.