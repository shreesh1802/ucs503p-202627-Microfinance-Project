# W6: Who decides whether a borrower can pay — the wallet or the loan?

## Starting point

The repay page had a rule inherited from the first version of the
payments feature: a borrower may pay only if the wallet covers the
**total** dues across *all* their active loans this cycle. Running the
demo path repeatedly made me doubt it, so this week was spent deciding
what the rule should actually be and changing it.

## The two candidate rules

**Aggregate.** Compute every active loan's EMI for this cycle, sum them,
and block every payment unless the wallet covers the lot.

*Argument for:* it stops a borrower clearing the small loan while silently
defaulting on the large one, and the system never helps someone into a
worse position than they started.

**Per loan.** Each loan is checked against its own EMI. If the wallet
covers that instalment, it can be paid.

*Argument for:* it matches what the borrower is actually being asked to
do. They are paying *this* loan. A borrower with three loans and enough
money for one is better off paying one than paying none, and the
aggregate rule makes the second-best outcome impossible.

## What settled it

The aggregate rule produced a screen that could not be explained to the
person reading it. With two loans and enough for the first, the page
showed an affordable instalment next to a blocked button, and the reason —
"you also owe something else later this cycle" — was nowhere in the
borrower's mental model of the action they were taking.

Worse, it makes the system an enforcement mechanism it was never designed
to be. Refusing a payment someone can afford, in order to protect them
from a position they are already in, is a policy decision. The project has
no mandate for it, and no lender asked for it.

**Fix:** switched the sufficiency check to per-loan. The due summary still
shows the total across all active loans, so nothing is hidden — the
borrower can see the full picture and decide — but the gate on each
payment is that loan's own instalment.

## Edge cases that came with it

Evaluating each loan on its own is also what later exposed two bugs in the
loan state: fully repaid loans that were still offered for payment, and
Missed cycles that could never be cleared. They were found and fixed in the
end-to-end run written up in W3, so the details are there rather than
repeated here.

## Because

A rule that protects the user from themselves needs a stronger
justification than a rule that does what the user asked. The aggregate
check had the better-sounding argument and the worse behaviour: it blocked
affordable payments, it could not explain itself on screen, and it quietly
assumed an authority over the borrower's choices that the product does not
have.
