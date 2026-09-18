# W2: From Borrower Eligibility to Lending Decision

## 1. Completing the Lender Flow

In the second week, I focused on what happens after borrowers become visible to the lender.

The lender workflow moves from identifying eligible borrowers to reviewing loan requests and taking a lending decision.

The overall process can be represented as:

$$
\text{Eligible Borrower}
\rightarrow
\text{Loan Request}
\rightarrow
\text{Lender Review}
\rightarrow
\begin{cases}
\text{Approve}\\
\text{Decline}
\end{cases}
$$

This made the lender role more than just a borrower-discovery interface. The lender becomes an active participant in the loan lifecycle.

---

## 2. Working with Loan Requests

Once a borrower submits a request, the request becomes part of the loan-request workflow.

The application provides an endpoint for retrieving loan requests:

```text
GET /api/loan-requests
```

The lender can use the available request information to understand what the borrower is asking for before making a decision.

The information involved in this stage connects the borrower, requested amount, lender and current request status.

The important distinction is:

$$
\text{Borrower Eligibility}
\neq
\text{Loan Approval}
$$

A borrower can satisfy the eligibility conditions without automatically receiving a loan.

---

## 3. Making the Lending Decision

The lender decision is handled through a dedicated API operation:

```text
POST /api/loan-requests/{request_id}/decide
```

The decision can result in approval or rejection.

Conceptually:

$$
Decision =
\begin{cases}
Approve(rate)\\
Decline
\end{cases}
$$

If the lender approves a request, the lending terms such as the interest rate become part of the resulting decision.

This helped me understand that the decision stage is separate from the matching stage. Matching determines which borrowers can be considered, while the decision determines what happens to a particular request.

---

## 4. Authentication During the Decision

Authentication remains important even after a borrower has been matched.

The decision request must be associated with the authenticated lender:

$$
\text{Token}
\rightarrow
\text{Current Lender}
\rightarrow
\text{Decision}
$$

This prevents the system from relying only on a lender identifier supplied by the client.

The backend can therefore verify that the lender making the decision is actually authorized to perform the operation on that request.

This provides another layer of protection between the lender interface and the underlying data.

---

## 5. Targeted Loan Requests

The project also supports the idea of a borrower request being directed towards a particular lender.

A request can contain a target lender:

```text
target_lender_id
```

This creates two possible paths for a request:

$$
Request
\rightarrow
\begin{cases}
\text{Marketplace}\\
\text{Specific Lender}
\end{cases}
$$

A marketplace request can be considered by eligible lenders, while a targeted request can be associated with a particular lender.

From the lender's perspective, this means that not every request visible in the system should necessarily be treated as a request intended for that lender.

---

## 6. SHG-Lender Relationships

Another part of the lender workflow is the relationship between lenders and Self-Help Groups (SHGs).

The project maintains links between lenders and SHGs. These links can have different states depending on the decision taken by the relevant party.

The basic state transition can be represented as:

$$
Pending \rightarrow Approved
$$

or:

$$
Pending \rightarrow Rejected
$$

The relevant lender-side operations include:

```text
GET /api/lenders/{lender_id}/links
POST /api/links
POST /api/links/{link_id}/decide
```

This relationship is important because an approved SHG-lender connection can influence which borrowers become accessible to a lender.

---

## 7. SHG Relationships and Borrower Matching

The connection between SHGs and lenders also fits into the borrower-matching process.

When a lender has an approved relationship with an SHG, borrowers belonging to that SHG can become relevant to the lender's matching workflow.

Conceptually:

$$
Approved(SHG,Lender)
\Rightarrow
SHG\ Borrowers
\rightarrow
Lender\ Matching
$$

This showed me how different modules of the application are connected.

The SHG relationship is not an isolated feature. It can affect the set of borrowers that a lender is able to consider.

---

## 8. Understanding Lender Reputation

The project also contains a lender reputation mechanism.

The reputation information is related to factors such as the lender's interest rate and marketplace activity.

It can be represented conceptually as:

$$
Reputation_L =
f(
InterestRate_L,
PlatformAverageRate,
MarketplaceActivity_L
)
$$

The purpose of examining this part of the code was to understand how lender-specific information can be presented alongside the lending workflow.

The reputation endpoint is:

```text
GET /api/lenders/{lender_id}/reputation
```

This is separate from borrower credit scoring. Borrower scoring evaluates the borrower, while lender reputation provides information about the lender.

---

## 9. Frontend and Backend Integration

The lender dashboard acts as the interface through which the lender interacts with these backend operations.

The general flow is:

$$
\text{UI}
\rightarrow
\text{API Request}
\rightarrow
\text{Backend}
\rightarrow
\text{Database Record}
$$

For example, a lender action on the dashboard can trigger an API request. The backend then validates the request, performs the required operation and updates or retrieves the relevant database information.

This separation helped me understand the role of each layer:

- **Frontend:** displays information and collects lender actions.
- **API layer:** receives requests from the frontend.
- **Backend logic:** performs validation, authorization and business rules.
- **Database:** stores the resulting application state.

---

## 10. Following a Loan Request Through the System

The lender-side workflow can be viewed as a sequence of states:

$$
Unauthenticated
\rightarrow
Authenticated
\rightarrow
Eligible\ Borrowers
\rightarrow
Loan\ Request
\rightarrow
Lender\ Decision
\rightarrow
Loan
$$

Each transition represents a different responsibility.

Authentication establishes the lender identity.

Eligibility determines which borrowers can be considered.

The loan request represents the borrower's requirement.

The lender decision determines whether the request is accepted or rejected.

The resulting loan state represents the next stage of the lending process.

Thinking about the workflow as states made it easier to understand how different API endpoints work together.

---

## 11. Connecting Relationships with the Lending Workflow

The SHG relationship workflow can similarly be viewed as a sequence:

$$
Pending\ Link
\rightarrow
Approved\ Link
\rightarrow
Eligible\ SHG\ Borrowers
$$

Therefore, the lender's access to borrowers can depend on information established elsewhere in the application.

This demonstrates why the lender workflow cannot be understood only by looking at the lender dashboard.

The backend combines information from different parts of the system before determining what the lender can access.

---

## 12. Technical Learning

During this stage, I focused on tracing the complete lender-side flow across the application.

The main areas studied were:

```text
Loan request APIs
Lender decision API
Targeted lender requests
SHG-lender links
Lender reputation
Frontend API integration
Backend authorization
Database state changes
```

Following these components helped me understand how a user action on the frontend eventually becomes a validated backend operation.

It also showed why API design and authorization are important in a multi-role application.

---

## 13. Final Understanding

The complete lender workflow can be summarized as:

$$
\boxed{
Auth
\rightarrow
Access\ Control
\rightarrow
Matching
\rightarrow
Decision
\rightarrow
Loan\ State
}
$$

The main learning from this week was that lending is not a single operation.

A lender first needs an authenticated session, then access to permitted borrowers, followed by the ability to review requests and make a decision. SHG relationships and lender-specific information further influence the context in which these decisions are made.

This gave me a clearer understanding of how authentication, authorization, matching, loan requests and lending decisions work together to form the lender side of the microfinance platform.
