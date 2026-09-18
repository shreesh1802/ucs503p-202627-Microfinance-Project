# Week 2 : Borrower Search Returns 422 and an Empty Table

# Client-Side Filtering vs the API Page Cap

## Error:

The admin dashboard's borrower browser rendered an empty
table with no error message. The network tab showed:

> GET /api/individuals?limit=1000 422 (Unprocessable
> Entity)
>
> {"detail":[{"type":"less_than_equal","loc":["query",
> "limit"],"msg":"Input should be less than or equal to
> 500","input":"1000","ctx":{"le":500}}]}

## Relevant Context

My first version of the browser fetched one large page and
filtered it in the browser as the admin typed:

``` javascript
// frontend/src/pages/dashboards/AdminDashboard.jsx
const { data } = useApi(() => listIndividuals({ limit: 1000 }))
const rows = (data?.items ?? []).filter(r =>
  r.name.toLowerCase().includes(query.toLowerCase()))
```

The endpoint it calls caps the page size:

``` python
# app/routers/individuals.py
def list_individuals(
    db: Session = Depends(get_db),
    admin: AdminActor = Depends(get_current_admin),
    search: str | None = None,
    ...
    limit: int = Query(50, le=500),
    offset: int = 0,
):
```

## Key Observation

There are two separate faults here, and fixing only the
visible one would have been worse than leaving it broken.

1. `limit=1000` violates `le=500`, so **every** request
   fails validation and the table is always empty.
2. Even with `limit=500`, the dataset has 1,079 borrowers.
   Filtering one page in the browser means roughly half
   the population can never be found by search -- the box
   would *look* like it worked while silently lying.

Fault 2 throws no error at all. It only shows up if you
search for a borrower you already know exists and notice
that they are not returned.

## Solution

Stop filtering on the client. The endpoint already accepts
a `search` parameter and pushes the work into SQL:

``` python
if search:
    term = search.strip()
    like = f"%{term}%"
    conditions = [Individual.name.ilike(like),
                  Individual.phone.ilike(like)]
    if term.isdigit():
        conditions.append(Individual.id == int(term))
    q = q.filter(or_(*conditions))
```

so the dashboard asks for a small page of *matches*
instead of a large page of *everything*:

``` javascript
const { data } = useApi(
  () => listIndividuals({ search: debounced, limit: 25 }),
  [debounced])
```

with a 250 ms debounce on the input so a query is not
fired on every keystroke.

**Because**

A page size that is "big enough" is not a design, it is a
guess that expires the moment the data grows. If a list
can grow, the filtering has to happen where the data is,
and the page size then only decides how much is drawn --
not how much is searchable.

The 422 was the useful part of this bug. The silent half
-- a search box that reaches half the population -- is the
kind of fault that survives a demo and reaches a user.
