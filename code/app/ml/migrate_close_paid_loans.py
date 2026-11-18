"""
One-off, idempotent fix for existing data: the original seed generator only
closed a loan when it reached its final cycle AND had a zero balance, but its
balance is principal-only, so many loans hit 0 early and stayed 'Active'
(owing nothing, yet payable). Closes every Active loan whose
outstanding_balance <= 0.01. Does not touch Defaulted loans or any other row.
(data_gen.py now applies the same rule when seeding.)

Run with:  python -m app.ml.migrate_close_paid_loans
"""
import sqlite3

from app.config import DATABASE_URL, DATA_DIR


def main() -> None:
    if not DATABASE_URL.startswith("sqlite"):
        raise RuntimeError("only supports the SQLite DATABASE_URL used by this project")
    con = sqlite3.connect(str(DATA_DIR / "microfin.db"))
    cur = con.execute(
        "UPDATE loans SET status = 'Closed' WHERE status = 'Active' AND outstanding_balance <= 0.01"
    )
    con.commit()
    print(f"Closed {cur.rowcount} fully-paid loan(s).")
    con.close()


if __name__ == "__main__":
    main()
