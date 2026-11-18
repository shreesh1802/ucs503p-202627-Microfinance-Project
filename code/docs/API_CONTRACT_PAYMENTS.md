# CreditSetu — Payments & Targeted Requests: API Contract (binding for Agent 4 & Agent 5)

Author: Agent 3 (QA/consolidation). This is the **single source of truth**
for the three product-owner-requested features below. Agent 4 (frontend) and
Agent 5 (backend) build directly from this file — do not re-read
`docs/REQUIREMENTS_PAYMENTS.md` or `docs/DESIGN_PAYMENTS.md`; both are
folded in here, with every open question they raised resolved. This file is
additive to, and consistent with, `docs/SPEC.md` + `docs/API_CONTRACT.md`
(the prior 4-role redesign — unchanged, still authoritative for everything
not mentioned here).

Ground truth (product owner, verbatim): (1) a borrower must be able to
target/request a specific lender from their suggested options, not just
broadcast; (2) the borrower dashboard needs a real "repay" action, not just
loan-history-with-no-action, so the borrower can improve their score by
repaying; (3) a dummy payment gateway must open on "repay", showing wallet
balance and amount owed, lets the borrower pay, and if the balance is less
than what's owed *this month across all loans* the borrower can't pay any of
them. **"Workable for anyone accessing this site"**: a real user must be
able to request → get approved → pay → see the score move, today, through
the live UI, with zero manual DB/script intervention. Every formula below is
checked against this constraint (§2).

---

## 1. Schema changes (final)

### 1.1 `individuals.wallet_balance`

```python
# app/models.py, class Individual
wallet_balance = Column(Float, nullable=True)
```

Nullable, same pattern as `password_hash`. Treat `NULL` as `0.0` everywhere
read (`ind.wallet_balance or 0.0`).

**Seeding rule**: `wallet_balance = round((ind.monthly_income or 0.0) * 1.5, 2)`.
1.5x monthly income is large enough to clear at least one EMI cycle but
small enough that the insufficient-funds state stays reachable for
borrowers with several simultaneous active loans. Confirmed
`monthly_income` exists on every `Individual` row today.

### 1.2 `loan_requests.target_lender_id`

```python
# app/models.py, class LoanRequest
target_lender_id = Column(Integer, ForeignKey("lenders.id"), nullable=True, index=True)
```

`NULL` = broadcast (today's only behavior, unchanged for existing rows — no
backfill needed, `NULL` is correct historical value).

### 1.3 Migration script

New file `app/ml/migrate_payments.py`, same idempotent raw-`sqlite3` +
`PRAGMA table_info` pattern as `app/ml/migrate_auth.py`:

```python
def add_columns():
    # ALTER TABLE individuals ADD COLUMN wallet_balance FLOAT   (if missing)
    # ALTER TABLE loan_requests ADD COLUMN target_lender_id INTEGER  (if missing)
    ...

def seed_wallet_balances():
    # UPDATE only rows WHERE wallet_balance IS NULL.
    # CRITICAL: this IS NULL guard is what makes the script safe to re-run
    # after borrowers have made live payments -- a second run must never
    # reset a balance that's already moved from a real payment back to
    # 1.5 * monthly_income.
    ...
```

Run via `python -m app.ml.migrate_payments`, documented in README next to
the existing `migrate_auth` invocation.

### 1.4 No other schema changes

Repayment recording reuses the existing `RepaymentEvent` table and enum
as-is. Loan state reuses `Loan.outstanding_balance` / `Loan.status` as-is.

---

## 2. EMI / due-cycle / On-time-vs-Late formula (final — verified live-workable)

### 2.1 Constraint this must satisfy

A loan disbursed five minutes ago, through the live UI, with zero
`RepaymentEvent` rows, must be immediately payable — nothing here may depend
on calendar time having elapsed since disbursement, or on a background job
having run. Verified below: it doesn't.

### 2.2 EMI (reused verbatim from `app/ml/data_gen.py`, computed on demand)

```python
emi = round(
    loan.principal_amount * (1 + loan.interest_rate / 100 * loan.tenure_months / 12)
    / loan.tenure_months,
    2,
)
```

Simple-interest-amortized. Computable immediately from the loan's own
columns — no dependency on `RepaymentEvent` history existing yet.

### 2.3 Cycle pointer

```python
n_resolved = count(RepaymentEvent for this loan, any status)   # Missed/Partial cycles are resolved history too
cycle_number = n_resolved + 1      # 1-indexed, next EMI due
# Loans with outstanding_balance <= 0.01 are omitted (nothing owed) and closed on payment.
amount_due_this_cycle = emi        # flat EMI, no partial-shortfall carry-forward (§4.3)
```

A brand-new loan has `n_paid = 0` → `cycle_number = 1` → payable now. This
satisfies §2.1: cycle position is derived from **count of payment events
made**, never from elapsed calendar time. If `cycle_number > tenure_months`
the loan is fully paid off (should coincide with `status == "Closed"`) and
is omitted from the payable list.

### 2.4 Theoretical due date — used only to classify On_Time/Late, never to gate payability

```python
theoretical_due_date = loan.disbursement_date + timedelta(days=30 * cycle_number)
```

Same 30-day-per-installment convention `data_gen.py` uses, so live and
synthetic history line up. **This date never blocks payment** — a borrower
can always pay today; paying after this date has passed just records as
`Late` instead of `On_Time`. This is what makes "pay a loan disbursed 5
minutes ago" work: `theoretical_due_date` for cycle 1 is ~30 days out, so
paying today is trivially `On_Time`, but even a borrower who is procedurally
"early" is never prevented from paying.

### 2.5 On_Time / Late decision

```python
today = date.today()
if today <= theoretical_due_date:
    status, days_late = "On_Time", 0
else:
    status, days_late = "Late", (today - theoretical_due_date).days
payment_date = today
amount_paid = emi
amount_due = emi
```

Only `On_Time`/`Late` are ever written by the live payment path.
`Partial`/`Missed` remain generator-only (synthetic history realism) —
confirmed out of scope for live payments, see §4.3.

### 2.6 Loan state updates on a successful payment

```python
loan.outstanding_balance = max(0.0, loan.outstanding_balance - emi)
if cycle_number >= loan.tenure_months:
    loan.status = "Closed"
```

**Note for Agent 5**: `data_gen.py` never decrements `outstanding_balance`
per synthetic event (it's set once at loan creation and left alone) — this
feature introduces the first real decrement. This is an intentional new
behavior, not a bug to match against existing synthetic data.

Only `"Active"` loans are ever payable; `Closed`/`Defaulted`/`Written_Off`
are excluded from the due-summary.

### 2.7 Score recompute — same transaction as the payment

Immediately after writing the `RepaymentEvent` and updating the loan, call
`compute_and_store_score(db, individual, notes="Recomputed after live repayment")`
(`app/services/scoring_service.py`) — confirmed this function only
`add()`s/`flush()`es and does **not** commit internally (verified by reading
its docstring/body: "added + flushed, not committed — caller commits"), so
it composes correctly inside the same transaction as the payment. One
`db.commit()` at the end covers `RepaymentEvent` insert + loan update +
wallet deduction + new `CreditScore`/`ScoreExplanation` rows atomically. The
borrower's next `GET /api/individuals/{id}` already reflects the new score —
no separate recompute step, satisfying "visibly move the score."

---

## 3. New/changed endpoints

New router `app/routers/payments.py` (`prefix="/api/payments"`), registered
in `app/main.py`. Auth via the existing `get_current_individual` /
`get_current_actor` dependencies in `app/routers/auth.py` — never a
client-supplied individual id for authorization (same rule as every other
endpoint in `API_CONTRACT.md`).

### 3.1 Targeted loan request — `POST /api/loan-requests` (existing, extended)

`app/schemas.py`, `LoanRequestIn`:

```python
class LoanRequestIn(BaseModel):
    individual_id: int
    principal: float
    tenure: int
    purpose: str | None = None
    target_lender_id: int | None = None   # NEW, optional
```

`app/services/loan_request_service.create_request` gains a `target_lender_id`
param:

- `None` (default) → today's broadcast behavior, unchanged.
- Set → validate the lender is currently in
  `eligible_lenders_for_individual(db, individual)` (reuse verbatim — do not
  reimplement eligibility). If not eligible → `LoanRequestError` → `400`:
  `"That lender isn't currently eligible for you — pick from your eligible-lenders list."`
  Store on `LoanRequest.target_lender_id`.

**`requests_for_lender` visibility change**: a `Pending` request with
`target_lender_id` set is included in a lender's queue **only if**
`target_lender_id == lender_id`, in addition to the existing
eligibility/decline-list filters. Other eligible lenders never see it, not
even read-only.

**`approve_request`**: no change beyond the filtering above — its existing
`_lender_eligible_for_individual` re-check at decide-time already covers
targeted requests too (defense-in-depth against score/SHG-link drift between
request and decision — confirmed correct, no new code needed).

**`decline_request` on a targeted request (resolved — was open in Agent 1's doc)**:
behaves exactly like today's broadcast decline — it inserts a
`LoanRequestDecline(request_id, lender_id)` row and leaves `req.status`
untouched (`Pending`). It does **not** auto-close the request, even though
the target lender is the only one who could otherwise see it. Rationale:
`LoanRequestDecline` is defined as "this lender's queue no longer shows it,"
not "this request is dead" — collapsing those two meanings for the targeted
case would be a special-cased status transition that doesn't exist anywhere
else in this model. Concretely:

- After the target lender declines, the request sits `Pending` with
  `target_lender_id` still set — but since `requests_for_lender` filters
  targeted requests to `target_lender_id == lender_id` regardless of
  decline-status, and the one eligible lender has just excluded themselves
  via `LoanRequestDecline`, the request is now invisible to *every* lender's
  queue. It is **not** silently dead: the borrower still sees it as
  `Pending` (matches `LoanRequest.status`, which is genuinely still
  `Pending` — no lender has "decided" it, they've only passed), so nothing
  is misrepresented to the borrower.
- **Borrower can re-target**: add `POST /api/loan-requests/{id}/retarget`
  (NEW) — borrower-only, must own the request, `400` if `status != "Pending"`,
  body `{"target_lender_id": int | null}`. Re-validates the new target (or
  clears it to fall back to broadcast) the same way `create_request` does,
  and — important — **deletes this borrower's own prior
  `LoanRequestDecline` row for this request if one exists for the new
  target**, so re-targeting to a lender who declined a *different* prior
  target doesn't leave a stale decline blocking them. (A decline is
  per-lender-per-request; retargeting to a lender who never declined this
  request needs no cleanup — only the "target back to the same lender who
  just declined" edge case needs the delete, and that case is legitimate:
  the borrower re-opening a conversation after e.g. their score improved
  from a live repayment is exactly the workflow this feature exists for.)
- This is the minimal fix that keeps a targeted-and-declined request from
  being a silent dead end, without inventing a new `LoanRequest.status`
  value (which would ripple into `RequestsTable`'s `StatusChip` mapping and
  every other status-branching spot) — it stays `Pending` throughout, exactly
  as the broadcast case already does when every eligible lender declines it.

**`_summary()` in `app/routers/loan_requests.py`** gains `target_lender_id`
and `target_lender_name` fields (mirrors existing
`decided_by_lender_id`/`decided_by_lender_name`).

### 3.2 `GET /api/payments/due-summary` (NEW)

Auth: borrower (own) or admin — same pattern as
`GET /api/loan-requests/eligible-lenders`. Query param `individual_id`
(must equal `actor.individual.id` for a borrower token, 403 otherwise; free
for admin).

Response:

```json
{
  "individual_id": 42,
  "wallet_balance": 18500.0,
  "total_due_this_cycle": 7200.0,
  "sufficient_funds": true,
  "loans": [
    {
      "loan_id": 101,
      "lender_name": "SHG Trust Cooperative",
      "purpose": "Crop input loan",
      "principal_amount": 30000.0,
      "interest_rate": 14.0,
      "tenure_months": 12,
      "outstanding_balance": 22500.0,
      "cycle_number": 4,
      "tenure_months_total": 12,
      "amount_due_this_cycle": 2700.0,
      "theoretical_due_date": "2026-09-10",
      "will_be_late": true
    }
  ]
}
```

- `loans`: every `Active` loan of this individual, `amount_due_this_cycle`
  etc. computed fresh on read (§2.2–2.4), never stored.
- `total_due_this_cycle` = sum across all `loans`.
- `sufficient_funds` = `wallet_balance >= total_due_this_cycle`, computed
  once across **all** active loans — the exact rule the product owner
  specified. No per-loan affordability flag is exposed, so the frontend
  cannot accidentally let one loan through when the aggregate is short.
- `will_be_late`: `today > theoretical_due_date` for that loan.
- `lender_name`/`purpose` added (not in Agent 1's draft) because the DESIGN
  doc's modal row spec (§3.3 state B) requires a "lender / loan purpose"
  line — folding that field in here avoids a second round-trip from the
  frontend.

This is the endpoint the payment-gateway page calls first, before any
payment.

### 3.3 `POST /api/payments/pay` (NEW)

Auth: borrower only (`get_current_individual`).

Request: `{"loan_id": 101}` — no amount field. A live payment is always the
full server-computed `amount_due_this_cycle`; keeping the amount
server-computed (never client-supplied) prevents a borrower from paying an
arbitrary amount that desyncs `outstanding_balance`/EMI math. **This also
means partial payment is structurally impossible via this endpoint** — see
§4.3 for the explicit in/out-of-scope decision.

**Server logic, one DB transaction, no early commits:**

1. Load the loan; `404` if missing; `403` if `loan.individual_id != current.id`.
2. `400` if `loan.status != "Active"`.
3. **Re-fetch `individual.wallet_balance` and recompute due-summary for all
   of this borrower's active loans inside this same request/transaction**
   (§4.1 below — never trust a client-cached `sufficient_funds` flag from an
   earlier `GET /due-summary` call). Re-check
   `wallet_balance >= total_due_this_cycle` across all active loans. If
   insufficient → `400`:
   ```json
   { "error": "insufficient_funds", "wallet_balance": 5000.0, "total_due_this_cycle": 7200.0 }
   ```
   This blocks payment of **every** active loan, not just the one requested
   — the frontend must treat this 400 as "nothing is payable right now."
4. Compute `emi`, `cycle_number`, `theoretical_due_date`, `status`,
   `days_late` (§2.2–2.5).
5. Insert `RepaymentEvent` row.
6. `individual.wallet_balance -= emi`.
7. Update `loan.outstanding_balance` / `loan.status` (§2.6).
8. `compute_and_store_score(db, individual, notes="Recomputed after live repayment")`.
9. `db.commit()`.

**Response:**

```json
{
  "loan_id": 101,
  "amount_paid": 2700.0,
  "status": "On_Time",
  "days_late": 0,
  "new_outstanding_balance": 19800.0,
  "loan_status": "Active",
  "new_wallet_balance": 15800.0,
  "new_score": { "score": 662, "risk_category": "Low" }
}
```

### 3.4 `POST /api/loan-requests/{id}/retarget` (NEW — see §3.1)

Auth: borrower only, must own the request. `400` if `status != "Pending"`.
Body: `{"target_lender_id": int | null}`. Same eligibility validation as
`create_request`. Deletes any existing `LoanRequestDecline` row for
`(request_id, target_lender_id)` when re-targeting to a lender who
previously declined this exact request. Response: same `_summary()` shape
as the other loan-request endpoints.

---

## 4. Resolutions to Agent 1/2's open questions (binding)

### 4.1 Race condition / row-locking — **confirmed pattern, minimal fix required (overrules Agent 1's "accepted as-is")**

Verified directly against `app/services/loan_request_service.py`'s
`approve_request` (the closest existing analogue — a read-check-then-write
mutating flow) — it does **not** use `SELECT ... FOR UPDATE` or any
row-locking primitive; it reads `req`/`lender`, validates, then writes.
Agent 1's factual claim that "no existing service uses row-locking anywhere"
is **correct** — confirmed, not overruled.

However, Agent 1's *conclusion* ("therefore accept the double-tab
insufficient-funds race as unaddressed risk") is overruled for one narrow
reason specific to payments: `approve_request`'s race window (two lenders
racing to approve the same request) only ever produces a harmless duplicate
loan in an already-degenerate double-approval scenario the UI doesn't
surface twice in practice, whereas the payments race Agent 1 flagged can let
a borrower's wallet balance go **negative** (two tabs both pass the
sufficiency check against the same stale balance, both deduct) — a visibly
broken number on the borrower's own dashboard, not just a background
inconsistency. That's a materially worse failure mode than anything the
existing codebase's lock-free pattern currently risks, so it gets the
minimal targeted fix rather than inheriting the general posture:

**Fix (Agent 5, inside `POST /api/payments/pay`, step 3 above):**
Re-fetch `individual.wallet_balance` from the DB (`db.refresh(individual)`
or a fresh `db.get(Individual, id)` inside the same request, not reusing a
value read earlier in the request or cached from a prior `/due-summary`
call) **immediately before** the sufficiency check and the deduction, and
perform the check-then-deduct as close together as possible with no
`await`/external call between them (this is sync SQLAlchemy, so "close
together" just means no intervening query that could yield). This does not
require `SELECT ... FOR UPDATE` (SQLite doesn't meaningfully support
row-level locking in this app's setup anyway — single-process dev server) —
a same-transaction re-fetch closes the realistic window for this
single-demo-user app without introducing a locking pattern that doesn't
exist anywhere else in the codebase. Two truly concurrent requests from the
same browser session remain a theoretical residual risk (acceptable,
consistent with the rest of the app), but the common case Agent 1's own
example describes (stale value read well before the write) is closed.

### 4.2 Payment gateway: dedicated route, not a modal (overrules Agent 1/2's "modal")

Both input docs assumed a true overlay/modal. **Decision: it's a dedicated
route, `/borrower/repay`, not a modal.** Reasons, checked against the actual
routing code:

- `frontend/src/App.jsx` has no modal/portal infrastructure at all — every
  screen is a top-level `<Route>` under `<ProtectedRoute role="...">`. There
  is no existing overlay primitive to extend (confirmed — Agent 1/2 both
  independently found the same thing: "no modal component exists").
- `ProtectedRoute.jsx`'s gating is purely route-based (`auth.role !== role`
  → redirect to that role's login). A true modal rendered from inside
  `BorrowerDashboard.jsx` would inherit that page's auth for free, which
  looks like the cheaper option — but building a from-scratch focus-trap +
  `aria-modal` + backdrop + Escape-key system (all specified in detail in
  `DESIGN_PAYMENTS.md` §3.1/§4) for a **single** use case, in a codebase
  that has deliberately never needed one anywhere else in four dashboards'
  worth of "Approve/Reject"-style actions, is exactly the kind of bespoke
  one-off Agent 1 themselves flagged as a risk ("keep it minimal, don't
  over-build a generic modal system for one use case") without following
  that advice to its conclusion — a route is a smaller diff and reuses 100%
  of the existing auth/gating machinery instead of reinventing a parallel
  client-side access-control surface.
- A dedicated route is also more consistent with "workable for anyone
  accessing the site": it gets a real URL, survives a refresh mid-flow, and
  needs zero new accessibility primitives beyond what every other page here
  already gets from full-page navigation (focus moves to the new page
  naturally; there's no focus-trap to build).

**Concrete routing/component plan:**

- New route in `App.jsx`: `/borrower/repay` → `<ProtectedRoute role="borrower"><RepayPage /></ProtectedRoute>`
  (same nesting pattern as `/borrower` itself).
- New component `frontend/src/pages/dashboards/RepayPage.jsx` (co-located
  with the other dashboard pages, not under `components/`, since it's a
  full page, not a shared widget) — content is exactly the DESIGN doc's §3
  states A–D (loading / ready / blocked / success), demo-mode badge (§3.2 of
  DESIGN_PAYMENTS.md, unchanged), same `.card`-based layout as every other
  dashboard card, `max-width: 480px` centered container instead of an
  overlay+backdrop (drop the backdrop/box-shadow-overlay CSS from
  `DESIGN_PAYMENTS.md` §3.1 — no longer applicable; keep everything else:
  the row layout, `.error-banner` blocked state, `.status-chip-approved`
  success state, "Score Impact" panel).
- **"Repay" button navigation**: on `LoansTable` (extend
  `BorrowerDashboard.jsx` lines 11-32 per REQUIREMENTS.md §4.2), the button
  is `<Link className="btn primary" to="/borrower/repay">Repay</Link>`
  (react-router `Link`, not a click handler + state) for rows where
  `l.status === 'Active'`. Since the page always shows **all** active loans
  and the aggregate gate (same "not just the one clicked" rule from
  REQUIREMENTS.md §4.2), no `loan_id` query param is needed for the primary
  flow — every Repay button on the dashboard goes to the same URL. (Optional
  nicety, not required: pass `?loan_id=101` and have `RepayPage` scroll/
  highlight that row — purely cosmetic, no functional dependency.)
- **Navigating back**: a "← Back to Dashboard" link/button at the top of
  `RepayPage.jsx` using `<Link to="/borrower">`, plus the success state's
  "Done" button (§3.3 state D of DESIGN_PAYMENTS.md) also navigates
  `to="/borrower"` via `useNavigate()` — this is the equivalent of "close
  modal, trigger dashboard refresh": because it's a real navigation back to
  `/borrower`, `BorrowerDashboard.jsx`'s own `useApi` hooks re-fetch
  naturally on mount, satisfying REQUIREMENTS.md §4.3 state D's "reload()/
  reloadRequests() pattern" requirement for free, with no manual
  reload-callback wiring needed between the two pages.
- Accessibility notes from `DESIGN_PAYMENTS.md` §4 that still apply: the
  `aria-live="polite"` region around the body content (Loading → Ready/
  Blocked → Success) — keep this, it's still correct for a full page.
  Focus-trap / backdrop-click / restore-focus-to-trigger items are dropped
  (not applicable to a routed page — the browser's own navigation/focus
  model already gets these for free, same as every other route in this app).

### 4.3 Partial payments — explicitly out of scope this pass (confirmed, not left open)

**Decision: out of scope.** `POST /api/payments/pay` takes no amount field
and always pays the full `amount_due_this_cycle` (§3.3). This is not merely
"the simple default" — it's structurally enforced (no client-suppliable
amount exists in the request shape at all), so there's no accidental partial
payment path to guard against later. `RepaymentEvent.status = "Partial"`
remains generator-only (`data_gen.py`), never written by the live path. A
future "pay less than the full EMI" feature would need a shortfall
carry-forward design (what happens to next cycle's `amount_due_this_cycle`)
that doesn't exist in the current schema or formula and is deliberately not
invented here — flagged, not built.

### 4.4 `target_lender_id` + `LoanRequestDecline` semantics — resolved, see §3.1 above

Summary: decline on a targeted request behaves identically to a broadcast
decline at the data-model level (inserts a `LoanRequestDecline` row, leaves
`status = "Pending"`); the practical effect is the request becomes invisible
to every lender's queue (since the one eligible lender excluded themselves),
but it is not silently dead — the borrower can call the new
`POST /api/loan-requests/{id}/retarget` to redirect it to a different
eligible lender (or fall back to broadcast) without having to withdraw and
recreate the request from scratch.

### 4.5 `ScoreHistoryChart.jsx` Y-axis bug — scoped fix for Agent 4

Verified directly against `frontend/src/components/ScoreHistoryChart.jsx`
lines 35 and 43-49: the `<LineChart>` has `margin={{ top: 8, right: 12,
left: -18, bottom: 0 }}` (line 35) while `<YAxis>` has `width={36}` (line
48) with `axisLine={false}` and `tickLine={false}`. The negative `left: -18`
margin shifts the entire plot area (including the Y-axis tick labels) 18px
further left than the axis's own reserved `width` accounts for, clipping the
labels against the card's left edge.

**Concrete fix**: change line 35's margin to `margin={{ top: 8, right: 12,
left: 0, bottom: 0 }}` (drop the negative left margin entirely — with
`axisLine={false}`/`tickLine={false}` already removing the axis line and
ticks, `width={36}` alone is enough reserved space for 3-digit score labels
like "662" without needing the negative-margin compensation that's
currently overcorrecting). No other changes to this file. Since Agent 4 is
already touching `BorrowerDashboard.jsx`'s loans table for the Repay button
in this same pass, fix this one-line issue alongside it rather than as a
separate change, per REQUIREMENTS.md §5's original flag.

### 4.6 Wallet balance is borrower-only — confirmed, unchanged from Agent 1

`wallet_balance` lives only on `Individual`. Lenders/SHGs/admin have no
wallet concept in this pass; out of scope if ever requested later.

---

## 5. UI flow spec (borrower dashboard) — final

### 5.1 Targeted-lender picker on the loan request form

Extend `RequestLoanForm` (`BorrowerDashboard.jsx` lines 34-82, already
fetches `eligibility` via `api.eligibleLendersFor`). Per
`DESIGN_PAYMENTS.md` §2 (adopted as-is — no changes needed there, it's pure
markup/CSS and doesn't touch routing):

- Two-option radio toggle: "Broadcast to all eligible lenders" (default) /
  "Choose a specific lender", revealing the bordered lender-row list from
  `eligibility.lenders` when the second option is picked.
- On submit, pass `target_lender_id: selectedLenderId || undefined` into
  `api.createLoanRequest(...)`.
- Helper sentence swaps to "Only {lender name} will see this request" when a
  specific lender is chosen (REQUIREMENTS.md §4.1 — unchanged).
- `RequestsTable` (lines 84-109) gains a `Target` column:
  `r.target_lender_name || 'Any eligible lender'`.
- For a `Pending` request that has been declined by its sole target (§3.1/
  §4.4), add a small inline "Re-target" affordance in the row (a `select` +
  small `.btn` reusing the same lender-list data already fetched for the
  create form, or a link to a small re-target sub-form) that calls
  `POST /api/loan-requests/{id}/retarget`. This is the UI surface for the
  retarget endpoint from §3.4 — without it the endpoint would exist with no
  caller, which isn't "workable for anyone accessing the site."

### 5.2 "Repay" button on the borrower's loan list

Extend `LoansTable` (lines 11-32). New `Repay` column: for `l.status ===
'Active'` rows, `<Link className="btn primary" to="/borrower/repay">Repay</Link>`;
non-active rows render nothing (matches `RequestsTable`'s existing
conditional-Withdraw-button pattern).

### 5.3 `RepayPage` (new page, replaces the "modal" concept — see §4.2)

New file `frontend/src/pages/dashboards/RepayPage.jsx`. Content per
`DESIGN_PAYMENTS.md` §3.2–§3.4 (demo-mode badge, states A–D, visual-states
table) verbatim, laid out as a page body instead of an overlay panel (drop
`DESIGN_PAYMENTS.md` §3.1's backdrop/overlay-shadow CSS only — everything
else in §3 applies unchanged):

- **On mount**: `GET /api/payments/due-summary?individual_id={auth.id}`.
- **State A (loading)**: `.loading` text.
- **State B (sufficient funds)**: header "Wallet balance: Rs.
  {wallet_balance}"; one row per active loan (lender/purpose, "EMI
  #{cycle_number} of {tenure_months_total}", `amount_due_this_cycle`, a Late
  badge if `will_be_late`, a "Pay this loan" `.btn.primary`). Clicking Pay
  calls `POST /api/payments/pay {loan_id}` → on success, show that row's
  inline success strip (State D content, per-row) **and re-fetch
  due-summary** so remaining rows reflect the reduced wallet balance/updated
  aggregate gate live, without leaving the page. On a live `400
  insufficient_funds` mid-session, drop the whole page into State C.
- **State C (blocked)**: `.error-banner` explaining wallet balance vs.
  total-due-across-all-active-loans (copy from `DESIGN_PAYMENTS.md` §3.3
  "Blocked" verbatim); no Pay buttons render; loan rows still list
  read-only; a `.btn` "Back to Dashboard" `<Link to="/borrower">` is the way
  out (this is the page-based equivalent of DESIGN_PAYMENTS.md's "Close"
  button).
- **State D (success, per-row inline + page-level)**: per-row strip as
  REQUIREMENTS.md §4.3 specifies ("Paid Rs. {amount_paid} — {On time/Late}.
  New score: {score} ({risk_category})"). A page-level "Done" `.btn.primary`
  (visible once at least one payment has succeeded this visit) navigates
  `useNavigate()` back to `/borrower`, which re-triggers
  `BorrowerDashboard.jsx`'s own data fetches on mount — this is the full
  replacement for the modal-close-triggers-reload requirement.
- Demo-mode badge (`DESIGN_PAYMENTS.md` §3.2, unchanged) renders on every
  state including success.
- `aria-live="polite"` around the body content region (Loading →
  Ready/Blocked → Success), per `DESIGN_PAYMENTS.md` §4 — the one
  accessibility note from that section that still applies to a routed page.

---

## 6. What changed from the two input docs, and why

1. **Modal → dedicated route** (§4.2). Both input docs specified a true
   overlay modal with a from-scratch focus-trap/backdrop/Escape system.
   Overruled: this codebase (`App.jsx`/`ProtectedRoute.jsx`, verified) has
   no modal primitive anywhere in four dashboards, and building one bespoke
   system for a single use case is a larger, riskier diff than a route that
   reuses 100% of the existing `ProtectedRoute` auth machinery. A route also
   survives refresh and needs no new a11y primitives.
2. **Race condition: "accepted as-is" → minimal targeted fix** (§4.1). Agent
   1's factual claim (no row-locking anywhere in the codebase) was verified
   true. Their conclusion was overruled anyway for this one endpoint only,
   because the specific failure mode — a borrower's own wallet balance going
   visibly negative on their own dashboard — is a worse, more visible
   failure than anything the current lock-free pattern risks elsewhere. Fix
   is a same-transaction re-fetch immediately before the check-and-deduct,
   not a new locking primitive.
3. **`LoanRequestDecline` + targeted requests: added a retarget endpoint**
   (§3.1/§3.4/§4.4). Agent 1 flagged this as open. Resolved: decline behaves
   identically to broadcast at the data level (no new status value), but a
   targeted-and-declined request would otherwise be a silent dead end with
   no lender able to see it and no borrower-facing recovery — so
   `POST /api/loan-requests/{id}/retarget` (new) and a small UI affordance
   (§5.1) were added so the request stays actionable, consistent with
   "workable for anyone accessing the site" (a real user hitting this case
   must have a way forward, not a dead request they have to withdraw and
   manually recreate).
4. **Partial payments**: confirmed out of scope, and confirmed *structurally*
   out of scope (no amount field exists in the request at all), not just
   "not built yet" — this was already Agent 1's recommendation, restated
   here as a firm decision per the task's instruction not to leave it open.
5. **`due-summary` response gained `lender_name`/`purpose` per loan**: not
   in Agent 1's draft, but required by Agent 2's own modal-row spec ("Lender
   / loan purpose" line) — added so the frontend doesn't need a second
   endpoint call to render the row.
6. **ScoreHistoryChart fix made concrete**: Agent 1 identified the right two
   lines (margin `left: -18` / `width={36}`) but left the exact fix open.
   Verified against the live file and specified precisely: drop the
   negative left margin to `0`; keep `width={36}`.
7. Everything else in both input docs (schema, EMI formula, cycle-pointer
   logic, On_Time/Late rule, `due-summary`/`pay` endpoint shapes, the
   lender-picker UI, the demo-mode badge, the states-table) is adopted
   **unchanged** — independently re-verified against `app/models.py`,
   `app/services/loan_request_service.py`, `app/routers/loan_requests.py`,
   `app/routers/individuals.py`, and `BorrowerDashboard.jsx` during this
   pass and found accurate.

---

## 7. Schema-change summary for Agent 5

1. `individuals.wallet_balance` — `Float`, nullable.
2. `loan_requests.target_lender_id` — `Integer`, FK → `lenders.id`, nullable, indexed.
3. New migration script `app/ml/migrate_payments.py` (idempotent, `IS NULL`-gated seeding).

No other tables, no fabricated business rows — consistent with the "no new
fabricated data" principle carried over from `docs/SPEC.md`.

## 8. New/changed endpoint summary for Agent 4/5

| Method | Path | Auth | Status |
|---|---|---|---|
| POST | `/api/loan-requests` | borrower only | CHANGED — `target_lender_id` optional field |
| POST | `/api/loan-requests/{id}/retarget` | borrower only, own request | NEW |
| POST | `/api/loan-requests/{id}/decide` | lender only | unchanged (existing eligibility re-check already covers targeted case) |
| GET | `/api/payments/due-summary` | borrower (own) or admin | NEW |
| POST | `/api/payments/pay` | borrower only | NEW |
