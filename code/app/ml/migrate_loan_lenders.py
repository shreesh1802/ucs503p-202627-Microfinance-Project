"""
Gives the synthetic "pre-marketplace" loans a lender, so a borrower's repayment
screen can say who they're repaying. The generator originally left
`loans.lender_id` NULL for all ~1,650 seeded loans (only loans created through
the live marketplace had one), which surfaced as a null `lender_name`.

Attribution follows the marketplace's own eligibility rules, not a free-for-all:
  - SHG member   -> one of the lenders with an *Approved* link to their SHG.
  - Independent  -> one of the lenders with `serves_independents = True`.
Loans that already have a lender are never touched. A loan whose borrower's SHG
has no Approved lender stays NULL -- there is no honest lender to attribute it to
(the API/UI show "Lender not recorded" for those). The pick is deterministic
(seeded by loan id), so re-running is safe and reproducible.

`data_gen.py` calls `backfill_loan_lenders` after it seeds lender links, so a
fresh seed never has the gap. For an existing database run:

    python -m app.ml.migrate_loan_lenders
"""
import random

from app.db import SessionLocal
from app.models import Individual, Lender, Loan, SHGLenderLink


def backfill_loan_lenders(db) -> tuple[int, int]:
    """Returns (assigned, left_null). Caller commits."""
    approved: dict[int, list[int]] = {}
    for shg_id, lender_id in (
        db.query(SHGLenderLink.shg_id, SHGLenderLink.lender_id)
        .filter(SHGLenderLink.status == "Approved")
        .order_by(SHGLenderLink.lender_id)
    ):
        approved.setdefault(shg_id, []).append(lender_id)
    independent_lenders = [
        l.id for l in db.query(Lender).filter(Lender.serves_independents.is_(True)).order_by(Lender.id)
    ]

    assigned = left_null = 0
    rows = (
        db.query(Loan, Individual.shg_id)
        .join(Individual, Individual.id == Loan.individual_id)
        .filter(Loan.lender_id.is_(None))
    )
    for loan, shg_id in rows:
        pool = approved.get(shg_id, []) if shg_id is not None else independent_lenders
        if not pool:
            left_null += 1
            continue
        loan.lender_id = random.Random(loan.id).choice(pool)
        assigned += 1
    db.flush()
    return assigned, left_null


def main() -> None:
    db = SessionLocal()
    try:
        assigned, left_null = backfill_loan_lenders(db)
        db.commit()
        print(f"Assigned a lender to {assigned} loan(s); {left_null} left without one "
              f"(borrower's SHG has no approved lender).")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
