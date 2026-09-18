# Week 4 : Integrating the SHG-Lender Partnership Workflow

# SHG-Lender Integration

## Objective

The fourth week focused on connecting the SHG dashboard with the backend
services and implementing the SHG-lender partnership workflow across the
frontend and backend.

## Relevant Context

The SHG dashboard needs to support both viewing existing lender
relationships and creating new partnership requests.

The workflow was structured as follows:

1. An authenticated SHG opens its dashboard.
2. Existing lender links are retrieved from the backend.
3. The SHG selects a lender from the available lender list.
4. The frontend sends a link request to the backend.
5. The backend validates the request and the SHG's access.
6. The link information is stored by the backend.
7. The updated relationship status is retrieved and displayed on the
   dashboard.

## Key Observation

The lender workflow involves multiple API operations rather than a single
request.

The SHG dashboard uses API operations for:

- Retrieving SHG information
- Retrieving existing lender links
- Retrieving available lenders
- Creating lender-link requests
- Approving or rejecting applicable link requests

Therefore, the frontend needs to remain synchronized with the backend state
after an operation changes a lender relationship.

## Access Control

The SHG identifier included in a request cannot be treated as sufficient
authorization.

The backend validates that the authenticated SHG corresponds to the SHG
represented by the requested operation. This prevents an SHG from creating
or modifying a partnership request on behalf of another SHG.

## Solution

The React dashboard was connected to the API client for the required SHG and
lender operations.

Loading and error states were handled during API operations so that the
interface can represent the state of an ongoing or unsuccessful request.

After a successful lender-link request or applicable decision, the lender
data is retrieved again from the backend. This allows the dashboard to
display the latest partnership status rather than relying only on the
previous frontend state.

## Because

Refreshing the lender relationship data after a state-changing operation
keeps the frontend representation consistent with the backend.

Keeping authorization checks in the backend also ensures that access
restrictions are enforced independently of the React interface.