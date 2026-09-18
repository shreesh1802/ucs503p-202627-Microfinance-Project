# W1: Understanding and Implementing the Lender Workflow

## 1. The Lender's Position in CreditSetu

CreditSetu connects borrowers with lenders while using the borrower's credit score as one of the inputs for lending decisions.

From the lender's perspective, the workflow can be represented as:

$$
\text{Lender Login}
\rightarrow
\text{Lender Authentication}
\rightarrow
\text{Eligible Borrowers}
\rightarrow
\text{Loan Request}
\rightarrow
\text{Lending Decision}
$$

The important part of the lender role is that the lender should only interact with borrowers and requests that are permitted by the platform's eligibility and authorization rules.

---

## 2. Understanding Lender Authentication

The lender is authenticated separately from the other roles in the system.

The application uses bearer tokens rather than JWTs. A successful lender login creates a lender session, and subsequent requests use:

```text
Authorization: Bearer <token>
```

The lender session associates the authentication token with the corresponding lender.

This allows the backend to determine:

$$
\text{Authenticated Token}
\rightarrow
\text{Lender Identity}
\rightarrow
\text{Authorized Resources}
$$

Instead of trusting a lender ID supplied by the frontend, the backend derives the lender identity from the authenticated session.

This is important because a lender should not be able to access another lender's private resources simply by changing an ID in a frontend request.

---

## 3. Borrower Eligibility

An important lender-side operation is identifying borrowers who can be considered by a particular lender.

A borrower can be considered through an approved SHG-lender relationship, or as an independent borrower when the lender supports independent borrowers.

The borrower must also have a latest calculated credit score satisfying the lender's minimum threshold:

$$
S_b \geq S_{\min}
$$

where $S_b$ is the borrower's latest score and $S_{\min}$ is the lender's minimum score threshold.

The lender's eligible set can therefore be represented as:

$$
E_L =
\{b \mid R(b,L)=1 \land S_b \geq S_{\min}\}
$$

where $R(b,L)$ represents relationship or independent-borrower eligibility.

This helped me understand that eligibility is not simply based on whether a borrower exists in the database. Multiple conditions have to be satisfied before the borrower becomes visible to the lender.

---

## 4. Lender-Specific Matching

The lender-specific endpoint used for retrieving eligible borrowers is:

```text
GET /api/lenders/{lender_id}/eligible-borrowers
```

The backend verifies that the authenticated actor is permitted to access that lender's resources.

The matching process considers information such as:

- borrower name
- district
- SHG status
- SHG name
- credit score
- risk category

Borrowers without a calculated score are excluded because there is no score against which the lender's threshold can be evaluated.

The results are ordered by score so that the lender can review the available borrowers in a meaningful order.

This separates the **matching stage** from the actual lending decision.

---

## 5. From Matching to an Offer

Finding an eligible borrower does not automatically create a loan.

Before an offer is created, the proposed principal must satisfy the lender's maximum loan constraint:

$$
P_{\text{offer}} \leq P_{\max}
$$

where $P_{\text{offer}}$ is the proposed principal and $P_{\max}$ is the lender's maximum permitted amount.

A lender offer contains information such as:

- lender
- borrower
- offered principal
- interest rate
- tenure
- status

This keeps the offer process connected to the lender's eligibility and amount constraints.

The basic flow can therefore be represented as:

$$
\text{Eligible Borrower}
\rightarrow
\text{Offer Constraints}
\rightarrow
\text{Lender Offer}
$$

---

## 6. Backend Authorization

The lender dashboard is only the interface. The actual security boundary is implemented on the server.

The authorization process can be represented as:

$$
\text{Request}
\rightarrow
\text{Token Verification}
\rightarrow
\text{Role Verification}
\rightarrow
\text{Resource Check}
\rightarrow
\text{Operation}
$$

This prevents a client from simply changing a `lender_id` value to access another lender's private resources.

The distinction between authentication and authorization is important:

**Authentication** determines who the lender is.

**Authorization** determines what that lender is allowed to access.

Therefore, logging in successfully does not automatically provide access to every lender resource.

---

## 7. Technical Areas Studied

The lender workflow spans several layers of the application, including:

```text
app/models.py
app/routers/lenders.py
app/services/matching_service.py
lender authentication dependencies
frontend/src/pages/dashboards/LenderDashboard.jsx
```

Tracing the flow across these layers helped connect the database models, backend authorization, matching logic and frontend behaviour.

The frontend provides the lender interface, while the backend performs the actual validation and access control.

This can be viewed as:

$$
\text{Frontend}
\rightarrow
\text{API}
\rightarrow
\text{Backend Logic}
\rightarrow
\text{Database}
$$

The separation helped me understand why a feature that looks simple on the dashboard can require changes or checks at multiple layers.

---

## 8. Lender Workflow as a Mathematical Filter

The lender matching process can be viewed as a sequence of filters.

Starting with the complete borrower set $B$:

$$
B
\rightarrow
B_{\text{relationship}}
\rightarrow
B_{\text{scored}}
\rightarrow
B_{\text{threshold}}
$$

where:

- $B$ represents all borrowers.
- $B_{\text{relationship}}$ represents borrowers accessible through the lender's relationship or independent-borrower rules.
- $B_{\text{scored}}$ represents borrowers with a calculated credit score.
- $B_{\text{threshold}}$ represents borrowers satisfying the lender's minimum score.

This helped me understand why the matching service should perform the filtering rather than leaving the decision entirely to the frontend.

The frontend should display the data provided by the backend instead of deciding whether a borrower is actually eligible.

---

## 9. Key Takeaway

The lender role is not limited to displaying a dashboard. It is a sequence of checks:

$$
\boxed{
\text{Authentication}
\rightarrow
\text{Authorization}
\rightarrow
\text{Eligibility}
\rightarrow
\text{Matching}
\rightarrow
\text{Offer}
}
$$

Each stage ensures that the lender operates only on valid and permitted data.

During this week, I focused on understanding how the lender identity is established, how eligible borrowers are selected, how lender-specific access is enforced, and how eligibility connects to the creation of a lending offer.

The main learning was that the lender workflow is distributed across the frontend, backend, authentication layer, matching service and database models rather than being implemented in a single component.
