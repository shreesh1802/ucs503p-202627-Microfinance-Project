"""Due-summary + live repayment endpoints (docs/API_CONTRACT_PAYMENTS.md §3.2/§3.3)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Individual, Loan
from app.routers.auth import get_current_actor, get_current_individual
from app.schemas import PayIn
from app.services.payment_service import (
    InsufficientFundsError, PaymentError, active_loans_due_summary, pay_loan,
)
from app.services.scoring_service import compute_and_store_score

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _loan_row(loan: Loan, info: dict) -> dict:
    return {
        "loan_id": loan.id,
        "lender_name": loan.lender.name if loan.lender else "Lender not recorded",
        "purpose": loan.purpose,
        "principal_amount": loan.principal_amount,
        "interest_rate": loan.interest_rate,
        "tenure_months": loan.tenure_months,
        "outstanding_balance": loan.outstanding_balance,
        "cycle_number": info["cycle_number"],
        "tenure_months_total": loan.tenure_months,
        "amount_due_this_cycle": info["amount_due_this_cycle"],
        "theoretical_due_date": info["theoretical_due_date"].isoformat(),
        "will_be_late": info["will_be_late"],
        "payable": info["payable"],
    }


@router.get("/due-summary")
def due_summary(
    individual_id: int,
    db: Session = Depends(get_db),
    actor=Depends(get_current_actor),
):
    """Borrower (own) or admin -- same pattern as /api/loan-requests/eligible-lenders."""
    if actor.role == "admin":
        pass
    elif actor.role == "individual" and actor.individual.id == individual_id:
        pass
    else:
        raise HTTPException(403, "You can only view your own due-summary.")

    ind = db.get(Individual, individual_id)
    if ind is None:
        raise HTTPException(404, f"Individual {individual_id} not found")

    summary = active_loans_due_summary(db, ind)
    return {
        "individual_id": ind.id,
        "wallet_balance": summary["wallet_balance"],
        "total_due_this_cycle": summary["total_due_this_cycle"],
        "sufficient_funds": summary["sufficient_funds"],
        "loans": [_loan_row(loan, info) for loan, info in summary["loans"]],
    }


@router.post("/pay")
def pay(body: PayIn, db: Session = Depends(get_db), current: Individual = Depends(get_current_individual)):
    """Borrower only. Pays the full server-computed amount_due_this_cycle for
    one loan, after a server-side per-loan sufficiency re-check (§3.3) --
    the borrower's other loans/balances don't affect whether this one is
    payable."""
    try:
        result = pay_loan(db, current, body.loan_id, compute_and_store_score)
        db.commit()
    except InsufficientFundsError as e:
        db.rollback()
        raise HTTPException(400, {
            "error": "insufficient_funds",
            "wallet_balance": e.wallet_balance,
            "amount_due": e.amount_due,
        })
    except PaymentError as e:
        db.rollback()
        msg = str(e)
        if msg == "__404__":
            raise HTTPException(404, f"Loan {body.loan_id} not found")
        if msg == "__403__":
            raise HTTPException(403, "You can only pay your own loans.")
        raise HTTPException(400, msg)
    return result
