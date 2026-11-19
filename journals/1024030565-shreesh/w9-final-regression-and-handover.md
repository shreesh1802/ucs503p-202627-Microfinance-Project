# W9: Last regression run, and what I would hand to the next team

## Starting point

Everything is written and the demonstration is rehearsed, so this week was
the pass that exists to find out whether all of it still runs together
after a semester of changes that each worked individually.

## What I re-ran

- **The full user journey**, in a browser, against a backup copy of the
  demonstration database (restored afterwards):
  borrower login → score and explanation → loan request targeted at a
  lender → lender approves with a rate → borrower repays an EMI through
  the demo gateway → score moves → admin sees the loan in the portfolio.
  Seven steps, four logins, one uninterrupted run.
- **The API error paths** that the journey does not exercise: paying
  another borrower's loan (403), an unknown loan (404), a wallet too small
  (400 with the shortfall), no token (401), a second decision on an
  already-decided link (400).
- **The test suite**, which comes out at 52 of 54, the two failures being
  D-01 and D-02 — both known, both written up, neither exposing data.

Nothing new broke. The one surprise was how much the *data* had moved
rather than the code: the loan status breakdown and the default rate are
both different from the prototype-stage figures, for reasons that are
documented but that I would have been unable to explain from memory a week
ago.

## What I would hand over

If another team picked this up, the four things I would tell them first:

1. **The cold-start blend is the project.** Everything else — marketplace,
   dashboards, anomaly flags — is ordinary CRUD around it. If you change
   one thing, change that one and measure it.
2. **The demo credentials are not security.** Publicly known seeded
   passwords, a shared hash across borrowers, a hard-coded gateway login, opaque
   tokens with no rotation. Every one is a deliberate demo shortcut and
   every one has to go before this touches a real person's data.
3. **The model is trained on 470-odd rows.** The monotone constraints make
   it behave, but no amount of constraint turns that into evidence about
   real borrowers. Treat the accuracy figures as "the pipeline works", not
   "the model is good".
4. **Run the migrations and read the README.** Both exist because the
   project was unreproducible for most of its life, and that was the
   single biggest waste of time in the semester.

## What I learned that I did not expect to

Most of the real bugs this term were not crashes. The risk labels read
backwards, the history chart sloped the wrong way, the score went *up*
after a late payment, a logged-out tab kept showing data, a settled loan
still asked for money. Every one of those rendered perfectly, threw no
exception, and was wrong.

The habit that caught them was the same each time: read the output and ask
whether it could actually be true. Nothing in a test suite does that for
you, because a test can only check the thing you already thought to doubt.
