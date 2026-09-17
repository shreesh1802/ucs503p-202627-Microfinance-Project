# Week 1 : Session for a Role That Has No Database Row

# Admin Login

## Error:

Error encountered on the first admin login attempt,
`POST /api/auth/admin/login`.

> sqlalchemy.exc.IntegrityError: (sqlite3.IntegrityError)
> NOT NULL constraint failed:
> individual_sessions.individual_id
> [SQL: INSERT INTO individual_sessions (individual_id,
> token, created_at, expires_at) VALUES (?, ?, ?, ?)]
> [parameters: (None, 'x3d...', '2026-...', '2026-...')]

## Relevant Context

Every other role hangs its session off a business row, so
the session table carries a non-null foreign key to it:

``` python
class IndividualSession(Base):
    __tablename__ = "individual_sessions"

    id = Column(Integer, primary_key=True)
    individual_id = Column(Integer,
                           ForeignKey("individuals.id"),
                           nullable=False, index=True)
    token = Column(String(64), nullable=False, unique=True,
                   index=True)
```

I tried to reuse that table for admin by passing `None`
for `individual_id`, because the bank/analyst who logs in
as admin is **not** a borrower, a lender or an SHG. There
is no `admin_users` table in the schema at all.

## Key Observation

The failure is not really about a NULL column. It is that
I was modelling admin as a *business entity* when it is
actually a *credential*. Adding an `admin_users` table
would have meant seeding a person who does not exist in
the dataset, which our own rule for this project forbids
(no fabricated business data).

## Solution

Read the credential from configuration, and give admin its
own session table with no foreign key at all.

``` python
# app/config.py
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
```

``` python
# app/models.py
class AdminSession(Base):
    """Admin session -- no FK, since admin is an env-var
    credential, not a business entity (docs/SPEC.md §6)."""
    __tablename__ = "admin_sessions"

    id = Column(Integer, primary_key=True)
    token = Column(String(64), nullable=False, unique=True,
                   index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
```

The dependency then returns a marker object rather than a
row, so nothing downstream can accidentally treat admin as
a person:

``` python
@dataclass
class AdminActor:
    name: str = "Admin"


def get_current_admin(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AdminActor:
    token = _bearer_token(authorization)
    if not auth_service.is_admin_token_valid(db, token):
        raise HTTPException(401, "Not logged in, or your "
                            "session has expired.")
    return AdminActor()
```

Credential check with a constant-time comparison:

``` python
def secrets_compare(a: str, b: str) -> bool:
    import hmac
    return hmac.compare_digest(a, b)
```

**Because**

A session table exists to answer *"which subject is this
token for?"*. When the subject is a configuration value
rather than a stored record, the only honest schema is one
that stores the token and nothing else, and the type
returned by the dependency should make that emptiness
visible to the next reader instead of hiding it behind a
fake row.

`hmac.compare_digest` is used in place of `==` because a
plain string comparison returns early on the first
differing character, and that timing difference is
measurable. It costs nothing to avoid.
