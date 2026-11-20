# W4: Scoring the Lender, Not Just the Borrower

## 1. The asymmetry worth fixing

Every borrower on the platform carries a score that lenders can read. The
lender carried nothing. A borrower choosing where to send a loan request
had the lender's name, its base interest rate and no way to judge whether
that rate was good.

The fourth week went into the lender reputation score: 0 to 100, where 50
is the platform average.

## 2. What the score is made of

Four components, weighted:

$$
R_{raw} = 0.45\,C_{rate} + 0.25\,C_{offers} + 0.20\,C_{activity}
          + 0.10\,C_{reach}
$$

$$
R = \mathrm{clip}\big(50 + 50\,R_{raw},\; 0,\; 100\big)
$$

- **Rate component** — the lender's base rate against the platform
  average, normalised:
  $(\bar{r} - r_{lender}) / \bar{r}$, clipped to $[-1, 1]$. Cheaper than
  average is positive.
- **Actual offers** — the same calculation on the rates the lender has
  *really* offered, not the advertised one. A lender can publish a low
  base rate and quote something else.
- **Activity** — offers made, relative to the most active lender.
- **Reach** — 1 if the lender serves independent borrowers, else 0.

The pricing weight (0.45) and the offer weight (0.25) together dominate,
which is deliberate: the score is meant to reward lending cheaply, not
lending loudly.

## 3. Why it is computed on read

```python
"""...compute-on-read, no caching column (only 6 lenders exist today,
cheap to recompute every time)."""
```

There is no `reputation_score` column. The score is derived from the
lender table and the offers table whenever someone asks for it.

A stored column would need updating every time any lender changed a rate
or made an offer — because every lender's score depends on the platform
*average*, one lender's change moves everyone else's number. Six lenders
make that recomputation free; a cache would be six ways to go stale.

## 4. The explanation line

A bare number says nothing, so the endpoint returns a sentence with it:

```python
if rate_component > 0.05:
    pricing_note = "rates below the platform average"
elif rate_component < -0.05:
    pricing_note = "rates above the platform average"
else:
    pricing_note = "rates near the platform average"
```

combined with whether the lender is active in the marketplace. The dead
band of ±0.05 matters: without it, a lender a fraction below average is
told it prices "below the platform average", which is technically true and
practically misleading.

## Because

A marketplace with a score on one side only is not a marketplace, it is an
assessment. Giving lenders a reputation puts a number on the side of the
transaction that was previously only doing the judging — and the weights
state plainly what the platform wants to encourage, which is lower rates
and willingness to serve borrowers who have no group behind them.
