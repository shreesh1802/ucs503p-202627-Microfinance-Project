"""Due-summary and live-repayment logic (docs/API_CONTRACT_PAYMENTS.md §2/§3).

EMI / cycle-number formula is calendar-independent -- derived purely from the
loan's own columns and the count of RepaymentEvent rows already recorded, so
a loan disbursed five minutes ago through the live UI, with zero
RepaymentEvent rows, is immediately payable (§2.1)."""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import Individual, Loan, RepaymentEvent


class PaymentError(ValueError):
    pass


class InsufficientFundsError(ValueError):
    """Carries the wallet_balance / amount_due pair the router needs to
    build the contract's exact 400 body. Scoped to the single loan being
    paid -- see pay_loan's per-loan sufficiency check below."""

    def __init__(self, wallet_balance: float, amount_due: float):
        self.wallet_balance = wallet_balance
        self.amount_due = amount_due
        super().__init__("insufficient_funds")


def compute_emi(loan: Loan) -> float:
    """Simple-interest-amortized EMI, reused verbatim from app/ml/data_gen.py."""
    return round(
        loan.principal_amount * (1 + loan.interest_rate / 100 * loan.tenure_months / 12)
        / loan.tenure_months,
        2,
    )


def cycle_info(db: Session, loan: Loan) -> dict:
    """Returns emi, cycle_number, amount_due_this_cycle, theoretical_due_date,
    will_be_late -- all computed fresh, never stored (§2.2-2.4)."""
    emi = compute_emi(loan)
    # Every recorded event (On_Time / Late / Partial / Missed) resolves its
    # cycle: a Missed or Partial cycle is history, not a debt that blocks the
    # pointer forever. Counting only On_Time/Late left a Missed cycle "due"
    # indefinitely with a due date that contradicted the Missed row itself.
    n_resolved = (
        db.query(RepaymentEvent)
        .filter(RepaymentEvent.loan_id == loan.id)
        .count()
    )
    cycle_number = n_resolved + 1
    theoretical_due_date = loan.disbursement_date + timedelta(days=30 * cycle_number)
    will_be_late = date.today() > theoretical_due_date
    return {
        "emi": emi,
        "cycle_number": cycle_number,
        "amount_due_this_cycle": emi,
        "theoretical_due_date": theoretical_due_date,
        "will_be_late": will_be_late,
    }


def active_loans_due_summary(db: Session, individual: Individual) -> dict:
    """Every Active loan of this individual, due amounts computed fresh.
    Used both by GET /due-summary and by the server-side re-check inside
    POST /pay (§3.3 step 3 -- never trust a client-cached flag).

    Sufficiency is per-loan (each loan's own `payable` flag: wallet_balance
    >= that loan's amount_due_this_cycle), not aggregate -- a borrower can
    pay any loan(s) they can individually afford, in any order, regardless
    of what's owed on the others. `total_due_this_cycle` /
    `sufficient_funds` are still returned as informational totals (e.g. for
    "you can't clear everything at once" messaging), but nothing blocks on
    them."""
    loans = (
        db.query(Loan)
        .filter(Loan.individual_id == individual.id, Loan.status == "Active")
        .all()
    )
    wallet_balance = individual.wallet_balance or 0.0
    items = []
    total_due = 0.0
    for loan in loans:
        info = cycle_info(db, loan)
        # A loan whose cycle pointer has run past its tenure is fully paid
        # off in substance even if a status flip hasn't landed yet -- omit
        # from the payable list (§2.3).
        if info["cycle_number"] > loan.tenure_months:
            continue
        # Nothing owed: balance already cleared (the seed generator tracks
        # principal-only balances, so some loans hit 0 before their last EMI).
        if loan.outstanding_balance <= 0.01:
            continue
        info["payable"] = wallet_balance >= info["amount_due_this_cycle"]
        items.append((loan, info))
        total_due += info["amount_due_this_cycle"]
    total_due = round(total_due, 2)
    return {
        "loans": items,
        "total_due_this_cycle": total_due,
        "wallet_balance": wallet_balance,
        "sufficient_funds": wallet_balance >= total_due,
    }


def pay_loan(db: Session, individual: Individual, loan_id: int, compute_and_store_score) -> dict:
    """Single-transaction pay flow (§3.3). Caller (router) commits after this
    returns -- this function only add()s/flush()es, matching
    compute_and_store_score's own "caller commits" contract, so everything
    lands atomically in one db.commit()."""
    loan = db.get(Loan, loan_id)
    if loan is None:
        raise PaymentError("__404__")
    if loan.individual_id != individual.id:
        raise PaymentError("__403__")
    if loan.status != "Active":
        raise PaymentError("This loan isn't active -- nothing is due.")

    # Re-fetch wallet_balance fresh and recompute due-summary immediately
    # before the sufficiency check and deduction, with no intervening query
    # that could yield (§4.1 race fix). Sufficiency is checked against THIS
    # loan's own amount_due_this_cycle only -- a borrower can pay any loan
    # they can individually afford, independent of what's owed elsewhere.
    db.refresh(individual)
    summary = active_loans_due_summary(db, individual)

    info = None
    for l, i in summary["loans"]:
        if l.id == loan.id:
            info = i
            break
    if info is None:
        # Loan is Active but already past its tenure (fully paid off in
        # substance) -- nothing payable.
        raise PaymentError("This loan has no cycle currently due.")

    if not info["payable"]:
        raise InsufficientFundsError(summary["wallet_balance"], info["amount_due_this_cycle"])

    emi = info["emi"]
    cycle_number = info["cycle_number"]
    theoretical_due_date = info["theoretical_due_date"]

    today = date.today()
    if today <= theoretical_due_date:
        status, days_late = "On_Time", 0
    else:
        status, days_late = "Late", (today - theoretical_due_date).days

    event = RepaymentEvent(
        loan_id=loan.id, due_date=theoretical_due_date, payment_date=today,
        amount_due=emi, amount_paid=emi, days_late=days_late, status=status,
    )
    db.add(event)

    individual.wallet_balance = round((individual.wallet_balance or 0.0) - emi, 2)

    loan.outstanding_balance = max(0.0, loan.outstanding_balance - emi)
    if cycle_number >= loan.tenure_months or loan.outstanding_balance <= 0.01:
        loan.status = "Closed"

    db.flush()

    score_row = compute_and_store_score(db, individual, notes="Recomputed after live repayment")

    return {
        "loan_id": loan.id,
        "amount_paid": emi,
        "status": status,
        "days_late": days_late,
        "new_outstanding_balance": loan.outstanding_balance,
        "loan_status": loan.status,
        "new_wallet_balance": individual.wallet_balance,
        "new_score": {"score": score_row.score, "risk_category": score_row.risk_category},
    }
