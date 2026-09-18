# Week 5 : Testing and Refining the SHG Module

# SHG Module Validation

## Objective

The fifth week focused on validating the integrated SHG workflow and checking
the interaction between the React frontend, FastAPI backend, and database.

## Relevant Context

The SHG module combines authentication, dashboard data retrieval, member
information, group statistics, and lender-partnership operations.

Testing therefore needed to cover both normal functionality and the
authorization restrictions associated with the SHG role.

## Functional Testing

The main workflows considered during validation were:

- SHG authentication
- Loading the SHG dashboard
- Displaying group statistics
- Displaying members
- Displaying member credit scores
- Loading linked lenders
- Requesting a lender partnership
- Approving a lender-initiated partnership
- Rejecting a lender-initiated partnership

These workflows were checked across the frontend and backend to ensure that
the dashboard receives and displays the expected information.

## Authorization Testing

Authorization was treated as an important part of the validation because
the application contains multiple roles.

An authenticated SHG should only be able to access information associated
with its own SHG.

Similarly, lender-link operations should only be permitted for the
appropriate authenticated SHG.

The purpose of these checks is to ensure that changing an SHG identifier in
a client request cannot be used to access another group's information.

## Error Handling

The dashboard was also checked for unsuccessful API operations and backend
availability issues.

Loading and error states were considered for API-dependent sections so
that a failed backend request is represented explicitly in the interface
rather than resulting in a silently incomplete dashboard.

## Refinement

The final stage focused on keeping the SHG workflow consistent across the
frontend and backend.

Particular attention was given to ensuring that the information displayed
after lender-related operations reflects the latest state returned by the
backend.

## Outcome

The SHG module reached an integrated state covering:

- SHG dashboard
- Group-level statistics
- Member information and credit scores
- Linked lenders
- SHG-lender partnership requests
- Role-based access restrictions
- Frontend handling of API loading and error states