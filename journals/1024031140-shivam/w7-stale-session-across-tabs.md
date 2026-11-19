# Week 7 : The Admin Dashboard That Would Not Go Away

# Stale Session Across Browser Tabs

## Error:

Found while rehearsing the demo. Two tabs open: admin in one, borrower
login in the other.

> Tab A: logged in as admin, Academic... platform overview on screen.
> Tab B: log in as a borrower -> borrower dashboard loads.
> Tab A: still showing the admin dashboard, full of data.
> Tab A: click anything -> 401, redirected to login.

So the admin view sat there looking live, with platform-wide numbers on
screen, after that session had already been replaced.

## Relevant Context

The frontend keeps one session for the whole browser:

``` javascript
// AuthContext.jsx -- one STORAGE_KEY, shared by every tab
const [auth, setAuth] = useState(() => readStoredAuth())
```

That is a deliberate decision, not an accident: one role logged in per
browser at a time keeps the demo honest and avoids pretending the
platform supports a user who is simultaneously a bank and a borrower.

The bug is what happens *after* the swap. `localStorage` is shared
across tabs, so logging in as the borrower overwrites the stored
session -- but React state in tab A was initialised once, at mount, and
nothing told it the world had changed. The component tree kept
rendering from memory.

## Key Observation

This is only cosmetic until you remember what the admin dashboard
displays. Borrower names, scores, district aggregates and anomaly flags
stayed on screen for a session that no longer existed. The data was
fetched legitimately, before the swap, and no new request would have
succeeded -- the server was never confused. But a bystander looking at
that tab sees platform-wide data in a window whose owner has logged
out, and "it only looks wrong" is not a defence I would want to make
about an oversight console.

It also explains a complaint I had dismissed earlier as flakiness:
"the dashboard isn't syncing." It was syncing. It had been logged out.

## Solution

Raised it with the owner of `AuthContext.jsx` with the reproduction
above, since the session context is shared by all four roles and not
mine to rewrite. The fix that went in listens for the storage event,
which fires in *other* tabs when the key changes, and folds the new
value straight into auth state:

``` javascript
useEffect(() => {
  // Only one role can be logged in per browser at a time (STORAGE_KEY is
  // shared across tabs by design). Without this, logging into a second
  // role in another tab silently logs out every other tab's session --
  // but their React state keeps showing the stale dashboard until the
  // next navigation/reload, which looks like data "isn't syncing".
  const onStorage = (e) => {
    if (e.key !== STORAGE_KEY) return
    try {
      setAuth(e.newValue ? JSON.parse(e.newValue) : null)
    } catch {
      setAuth(null)
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}, [])
```

I re-tested the admin side afterwards: tab A drops to the login screen
the instant tab B signs in, `ProtectedRoute` does the rest, and logging
out in one tab clears the others the same way. No admin data stays on
screen past its session.

**Because**

Any state copied out of a shared store has to subscribe to that store,
or it is a cache with no invalidation. `useState(() => read())` reads
once; the reader then has no idea the source changed. The storage event
exists for exactly this, and it is the browser telling you the
assumption you made at mount is no longer true.

The wider lesson for this role: for an oversight dashboard, "the server
would have refused the next request" is not sufficient. What is on the
screen is part of the access-control surface.
