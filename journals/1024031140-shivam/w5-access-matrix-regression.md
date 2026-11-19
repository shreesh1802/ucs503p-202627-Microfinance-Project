# Week 5 : Re-checking the Admin Gate After the Role Redesign

# Access Control Regression Pass

## Error:

After the role-based redesign landed, an admin token on an admin-only
endpoint was fine, but a *borrower* token on the same endpoint came back
with the wrong status:

> GET /api/individuals
> Authorization: Bearer <borrower token>
>
> 401 {"detail":"Not logged in, or your session has expired --
> please log in again."}

Access was refused, which is correct. The status code was not.

## Relevant Context

`docs/SPEC.md` is explicit about the two cases:

- **401** -- the caller is unknown: no token, an expired token, a token
  that matches no live session.
- **403** -- the caller is known, and still not allowed.

The admin dependency makes no such distinction:

``` python
def get_current_admin(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AdminActor:
    token = _bearer_token(authorization)
    if not auth_service.is_admin_token_valid(db, token):
        raise HTTPException(401, "Not logged in, or your session has "
                            "expired -- please log in again.")
    return AdminActor()
```

`is_admin_token_valid` only ever asks *"is this an admin session?"*. A
perfectly valid borrower token answers no, exactly as a garbage string
does, so both produce 401.

## Key Observation

I walked the whole matrix rather than spot-checking, because a redesign
that moves every endpoint behind a dependency is precisely when a gap
opens:

| Caller | Admin-only endpoint | Expected | Actual |
|---|---|---|---|
| no token | `/api/individuals` | 401 | 401 |
| borrower token | `/api/individuals` | 403 | **401** |
| lender token | `/api/anomalies` | 403 | **401** |
| SHG token | `/api/admin/model-health` | 403 | **401** |
| admin token | all of the above | 200 | 200 |
| admin token | `POST /api/links/{id}/decide` | 403 | 403 |

Two things are true at once. Nothing leaks -- every refusal is still a
refusal. And the frontend cannot tell the two cases apart, so a
logged-in lender who wanders onto an admin URL is bounced to the login
page instead of being told they lack access.

## Solution

Kept as defect **D-02** rather than patched in place, because the fix
belongs in the dependency and not in the handlers:

``` python
# intended shape
def get_current_admin(...):
    token = _bearer_token(authorization)
    if auth_service.is_admin_token_valid(db, token):
        return AdminActor()
    if auth_service.any_role_session_for(db, token):
        raise HTTPException(403, "This area is for the bank/analyst "
                            "login only.")
    raise HTTPException(401, "Not logged in, or your session has expired.")
```

The admin-only decide endpoint (`POST /api/links/{id}/decide`) already
returns 403 correctly, and stays as the reference behaviour.

**Because**

A status code is an interface, not decoration. 401 says *"tell me who
you are"* and the only sensible client response is to re-authenticate;
403 says *"I know who you are and the answer is still no"*, where
re-authenticating is pointless and the user needs a message. Collapsing
the two means the frontend's only possible reaction to either is the
wrong one half the time.

Logging it instead of hot-fixing it was deliberate too: the change
touches the dependency every admin endpoint shares, and the week's
remaining time was better spent proving the gate denies correctly
everywhere than rewriting it in a hurry.
