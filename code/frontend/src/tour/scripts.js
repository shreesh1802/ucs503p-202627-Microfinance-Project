import { DEMO_LOAN, GATEWAY_CREDS } from './accounts'

// Guided-demo scripts. Each step:
//   title, act       -- heading, and a one-line "what the tour does now"
//   text             -- explanation (string, or (ctx) => string once the step ran)
//   login            -- role whose login form this step fills in (UI login)
//   role, path       -- session and page the step needs; the engine logs in
//                       silently / navigates first if you jump straight here
//   setup(h)         -- idempotent: brings the page into the right state,
//                       re-run every time the step is shown
//   action(h)        -- changes data; runs at most once per tour run, so
//                       Previous / jumping back never repeats it
//   target, after    -- elements to highlight before / after the action
//                       (CSS selector, array, or (ctx) => selector)

const T = (k) => `[data-tour="${k}"]`

// ------------------------------------------------------------ shared steps

const loginStep = (role, label, afterTarget, text) => ({
  title: `Log in as the ${label}`,
  act: `Opening the ${label} login page and typing the demo credentials.`,
  login: role,
  target: T('login-card'),
  after: afterTarget,
  text,
})

async function openGateway(h) {
  if (h.$(T('r-loan')) || h.$(T('r-empty'))) return
  const user = await h.waitFor('#gw-user')
  await h.type(user, GATEWAY_CREDS.username)
  await h.type(await h.waitFor('#gw-pass'), GATEWAY_CREDS.password)
  await h.sleep(300)
  h.click(await h.waitFor(T('r-gateway-submit')))
  await h.waitFor(`${T('r-loan')}, ${T('r-empty')}`, { timeout: 15000 })
}

async function fillLoanRequest(h, { lenderId }) {
  const form = await h.waitFor(T('b-request'))
  h.bring([form])
  await h.type(await h.waitFor(T('b-principal')), DEMO_LOAN.principal)
  await h.type(await h.waitFor(T('b-tenure')), DEMO_LOAN.tenure)
  await h.type(await h.waitFor(T('b-purpose')), DEMO_LOAN.purpose, { delay: 30 })
  h.click(await h.waitFor(T('b-mode-specific')))
  const opt = await h.waitFor(`${T('b-lender-opt')}[data-lender-id="${lenderId}"]`)
  h.click(opt)
  await h.sleep(500)
  const before = new Set(h.$$(`${T('b-request-row')}`).map((r) => r.dataset.requestId))
  const submit = await h.waitFor(T('b-request-submit'))
  h.commit()
  h.click(submit)
  const row = await h.waitFor(T('b-request-row'), {
    timeout: 12000,
    test: (r) => !before.has(r.dataset.requestId),
  })
  return Number(row.dataset.requestId)
}

// The loan created earlier in the story is the newest one (highest id).
function pickNewestLoan(h) {
  if (h.ctx.newLoanId) return
  const ids = h.$$(T('r-loan')).map((r) => Number(r.dataset.loanId))
  if (ids.length) h.ctx.newLoanId = Math.max(...ids)
}

const readScore = (h) => {
  const fig = h.$(`${T('b-score')} .hero-figure`)
  const band = h.$(`${T('b-score')} .score-badge, ${T('b-score')} .status-chip`)
  return { score: fig?.textContent?.trim(), band: band?.textContent?.trim() }
}

// ------------------------------------------------------------- the tours

const storyTour = {
  id: 'story',
  title: 'End-to-end: from loan request to repayment',
  blurb: 'Follow one loan across all four roles: a borrower requests it, a lender approves it, the borrower repays an EMI, and the admin sees it. This tour makes real changes to the demo database.',
  steps: [
    {
      title: 'What this demo shows',
      act: 'Opening the home page.',
      path: '/',
      target: T('home-hero'),
      text: (c) =>
        `CreditSetu gives every microfinance borrower their own credit score and connects them with lenders. In this demo we follow one loan from start to finish, across all four roles. Our borrower is ${c.accounts.borrower.name}, a member of the self-help group ${c.accounts.borrower.shgName}. Our lender is ${c.accounts.lender.name}. The tour clicks and types in the real app for you. It makes real changes to the demo data: one loan request, one new loan, and one repayment.`,
    },
    loginStep('borrower', 'borrower', T('b-score'),
      'Borrowers log in with their phone number. Each of the four roles has its own login, and the server checks the role and the person on every request, so a borrower can only ever see their own data.'),
    {
      title: "The borrower's own credit score",
      act: 'Reading the score card.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-score'),
      setup: async (h) => {
        await h.waitFor(`${T('b-score')} .hero-figure`)
        if (!h.ctx.scoreBefore) h.ctx.scoreBefore = readScore(h)
      },
      text: (c) =>
        `${c.accounts.borrower.name.split(' ')[0]}'s score is ${c.scoreBefore?.score ?? 'shown here'}, on a scale of 300 to 900. Because this borrower belongs to a self-help group, the score started from a head start earned by the group's repayment record. The borrower's own repayments have taken over since then.`,
    },
    {
      title: 'Why the score is what it is',
      act: 'Highlighting the explanation chart.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-shap'),
      text: 'Every score comes with its reasons. Each bar is how many points one factor added or took away, compared with a typical borrower. Green bars helped, red bars hurt. The biggest factor is usually the share of missed payments.',
    },
    {
      title: 'Requesting a loan from a chosen lender',
      act: `Filling in Rs. ${DEMO_LOAN.principal.toLocaleString('en-IN')} for ${DEMO_LOAN.tenure} months, choosing the lender, and submitting.`,
      role: 'borrower',
      path: '/borrower',
      target: T('b-request'),
      action: async (h) => {
        h.ctx.requestId = await fillLoanRequest(h, { lenderId: h.ctx.accounts.lender.id })
      },
      after: (c) => `${T('b-request-row')}[data-request-id="${c.requestId}"]`,
      text: (c) =>
        `The borrower asks for ${DEMO_LOAN.principal.toLocaleString('en-IN')} rupees over ${DEMO_LOAN.tenure} months. The request could be broadcast to every eligible lender, but here it goes only to ${c.accounts.lender.name}. A lender is eligible only if the borrower's group has an approved partnership with it and the borrower's score meets its minimum. The new request now shows as Pending.`,
    },
    loginStep('lender', 'lender', T('l-rep'),
      "Now we switch sides and log in as the lender. A lender's username is its name in lowercase with dashes."),
    {
      title: 'The request arrives in the lender’s queue',
      act: 'Finding the new request in the incoming queue.',
      role: 'lender',
      path: '/lender',
      target: (c) => (c.requestId ? `${T('l-request-row')}[data-request-id="${c.requestId}"]` : T('l-requests')),
      setup: async (h) => {
        if (h.ctx.requestId) await h.waitFor(`${T('l-request-row')}[data-request-id="${h.ctx.requestId}"]`)
      },
      text: (c) =>
        c.requestId
          ? `Here is the borrower's request, waiting for a decision. The lender sees the borrower's score and risk band before deciding. Only lenders the borrower is eligible for ever see the request.`
          : 'The demo request was not created in this run. Go back to the step where the borrower requests a loan.',
    },
    {
      title: 'The lender approves it at 14%',
      act: 'Entering an interest rate of 14% and pressing Approve.',
      role: 'lender',
      path: '/lender',
      target: (c) => `${T('l-request-row')}[data-request-id="${c.requestId}"]`,
      action: async (h) => {
        if (!h.ctx.requestId) return
        const sel = `${T('l-request-row')}[data-request-id="${h.ctx.requestId}"]`
        const row = await h.waitFor(sel)
        const rate = row.querySelector(T('l-rate'))
        await h.type(rate, DEMO_LOAN.rate)
        await h.sleep(300)
        h.commit()
        h.click(row.querySelector(T('l-approve')))
        await h.waitFor(`${sel}[data-status="Approved"]`, { timeout: 12000 })
      },
      text: 'The lender sets the interest rate and approves. The server checks again, at the moment of the decision, that the borrower is still eligible and that the amount is within the lender\'s limit, and then creates an active loan straight away. Declining would only remove the request from this lender\'s queue. It would stay open for the other eligible lenders.',
    },
    loginStep('borrower', 'borrower', T('b-loans'),
      'Back to the borrower. The loan history now includes the new loan, active and with no repayments yet.'),
    {
      title: 'Opening the payment gateway',
      act: 'Opening Repay and signing in to the demonstration gateway.',
      role: 'borrower',
      path: '/borrower/repay',
      target: T('r-card'),
      setup: openGateway,
      text: 'Repayments go through a demonstration payment gateway. It is clearly marked as a demo and moves no real money. Each borrower has a wallet balance to pay from.',
    },
    {
      title: 'What is due this cycle',
      act: 'Reading the wallet and the new loan’s EMI.',
      role: 'borrower',
      path: '/borrower/repay',
      setup: async (h) => {
        await openGateway(h)
        pickNewestLoan(h)
        h.ctx.wallet = h.$(T('r-wallet'))?.textContent?.trim()
      },
      target: (c) => [T('r-wallet'), `${T('r-loan')}[data-loan-id="${c.newLoanId}"]`],
      text: (c) =>
        `${c.wallet || 'The wallet balance is shown at the top'}. Each loan row names the lender and shows this cycle's EMI, the equal monthly instalment. The new loan from ${c.accounts.lender.name} is on its first EMI. A borrower can pay any loan the wallet covers, in any order.`,
    },
    {
      title: 'Paying the first EMI',
      act: 'Pressing Pay this loan on the new loan.',
      role: 'borrower',
      path: '/borrower/repay',
      setup: async (h) => {
        await openGateway(h)
        pickNewestLoan(h)
      },
      target: (c) => `${T('r-loan')}[data-loan-id="${c.newLoanId}"]`,
      action: async (h) => {
        if (!h.ctx.newLoanId) return
        const row = await h.waitFor(`${T('r-loan')}[data-loan-id="${h.ctx.newLoanId}"]`)
        h.commit()
        h.click(row.querySelector(T('r-pay')))
        const res = await h.waitFor(`${T('r-loan')}[data-loan-id="${h.ctx.newLoanId}"] ${T('r-result')}`, { timeout: 15000 })
        h.ctx.payResult = res.textContent.replace(/\s+/g, ' ').trim()
      },
      text: (c) =>
        `${c.payResult ? `${c.payResult}. ` : ''}In a single database transaction the server recorded the repayment as on time or late, took the EMI from the wallet, reduced the loan balance, and recalculated the credit score. If any part fails, nothing changes. A single on-time payment often moves the score only a little, or not at all. It is the steady record over many payments that counts.`,
    },
    {
      title: 'The score history keeps every change',
      act: 'Back on the dashboard, highlighting the score history.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-history'),
      text: 'Every repayment adds a new point to the score history. Old scores are never overwritten, so the borrower, and an auditor, can always see how the score got where it is.',
    },
    loginStep('admin', 'bank admin', T('a-portfolio'),
      'Finally the bank or platform admin, who has a read-only view across everyone.'),
    {
      title: 'The admin sees the new loan',
      act: 'Highlighting the loan status chart.',
      role: 'admin',
      path: '/admin',
      target: T('a-loans'),
      text: 'The loan we just created is counted here with every other loan on the platform. The admin can watch the whole portfolio, but cannot approve loans or decide partnerships. Those decisions belong to the lenders and the groups.',
    },
    {
      title: 'That is the full loop',
      act: 'Demo complete.',
      path: null,
      target: null,
      text: 'We followed one loan through all four roles: the borrower requested it, the lender approved it, the borrower repaid an EMI and the score was recalculated, and the admin saw it on the platform. Choose another tour from the Guided demo button to look at any single role in more depth.',
    },
  ],
}

const borrowerTour = {
  id: 'borrower',
  title: 'Borrower: score, loan request and repayment',
  blurb: 'Everything a borrower can do: read their score and why, request a loan from a chosen lender and withdraw it, and pay an EMI. Makes real changes to the demo data.',
  steps: [
    {
      title: 'The borrower’s view',
      act: 'Opening the home page.',
      path: '/',
      target: T('home-hero'),
      text: (c) => `This tour walks through everything a borrower can do. Our borrower is ${c.accounts.borrower.name}, a member of ${c.accounts.borrower.shgName}. The tour types and clicks for you, and it will submit a loan request, withdraw it, and pay one EMI.`,
    },
    loginStep('borrower', 'borrower', T('b-score'),
      'Borrowers log in with their phone number. The demo password for every seeded borrower is password123.'),
    {
      title: 'Score and risk band',
      act: 'Reading the score card.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-score'),
      setup: async (h) => {
        await h.waitFor(`${T('b-score')} .hero-figure`)
        h.ctx.score = readScore(h)
      },
      text: (c) => `The score is ${c.score?.score ?? 'shown here'}, between 300 and 900, with a risk band underneath. The basis line says whether the score still leans on the group's head start or comes from the model alone. That switch happens after six repayments.`,
    },
    {
      title: 'Score history',
      act: 'Highlighting the score history chart.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-history'),
      text: 'Each point is one stored score. Scores are only ever added, never overwritten, so the history shows exactly how the score has moved.',
    },
    {
      title: 'Why you got this score',
      act: 'Highlighting the explanation chart.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-shap'),
      text: 'This chart explains the score factor by factor, in score points, compared with a typical borrower. It is built from SHAP values of the scoring model, so the borrower sees what helped and what hurt.',
    },
    {
      title: 'Ways to improve',
      act: 'Highlighting the improvement tips.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-tips'),
      text: 'The factors that hurt the score most are turned into plain-language tips, up to five, so the borrower knows what to work on.',
    },
    {
      title: 'Loan history',
      act: 'Highlighting the loan table.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-loans'),
      text: 'All of the borrower\'s loans, with their status and how many repayments were made. Active loans have a Repay button.',
    },
    {
      title: 'Suggested lenders',
      act: 'Highlighting the suggested lenders.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-suggested'),
      text: 'Lenders the borrower is currently eligible for, cheapest first, with each lender\'s reputation score. A lender is eligible through an approved partnership with the borrower\'s group and a minimum score.',
    },
    {
      title: 'Requesting a loan',
      act: `Filling in Rs. ${DEMO_LOAN.principal.toLocaleString('en-IN')} for ${DEMO_LOAN.tenure} months, picking one lender and submitting.`,
      role: 'borrower',
      path: '/borrower',
      target: T('b-request'),
      action: async (h) => {
        h.ctx.requestId = await fillLoanRequest(h, { lenderId: h.ctx.accounts.lender.id })
      },
      after: (c) => `${T('b-request-row')}[data-request-id="${c.requestId}"]`,
      text: (c) => `A request can be broadcast to every eligible lender or sent to one. Here it goes only to ${c.accounts.lender.name}, and it now shows as Pending in "Your loan requests". Any eligible lender that receives it can approve it, which creates the loan at once.`,
    },
    {
      title: 'Withdrawing a request',
      act: 'Pressing Withdraw on the request we just made.',
      role: 'borrower',
      path: '/borrower',
      target: (c) => `${T('b-request-row')}[data-request-id="${c.requestId}"]`,
      action: async (h) => {
        if (!h.ctx.requestId) return
        const sel = `${T('b-request-row')}[data-request-id="${h.ctx.requestId}"]`
        const row = await h.waitFor(sel)
        h.commit()
        h.click(row.querySelector(T('b-withdraw')))
        await h.waitFor(`${sel}[data-status="Withdrawn"]`, { timeout: 12000 })
      },
      text: 'While a request is pending, the borrower can withdraw it, or send it to a different lender. We withdraw this one so the demo does not leave an open request behind.',
    },
    {
      title: 'Offers from lenders',
      act: 'Highlighting the loan offers.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-offers'),
      text: 'Lending works in both directions. A lender can propose an offer to an eligible borrower, and it appears here for the borrower to accept or reject.',
    },
    {
      title: 'Your self-help group',
      act: 'Highlighting the group card.',
      role: 'borrower',
      path: '/borrower',
      target: T('b-shg'),
      text: 'A summary of the borrower\'s own group: members, average score, repayment and attendance rates. The borrower\'s head start came from the other members\' repayment record.',
    },
    {
      title: 'Opening the payment gateway',
      act: 'Opening Repay and signing in to the demonstration gateway.',
      role: 'borrower',
      path: '/borrower/repay',
      target: T('r-card'),
      setup: openGateway,
      text: 'Repayments go through a clearly labelled demonstration gateway that moves no real money. It shows the wallet balance and this cycle\'s EMI for every active loan.',
    },
    {
      title: 'Paying an EMI',
      act: 'Pressing Pay this loan on the first loan the wallet can cover.',
      role: 'borrower',
      path: '/borrower/repay',
      setup: async (h) => {
        await openGateway(h)
        if (!h.ctx.payLoanId) {
          const row = h.$$(T('r-loan')).find((r) => !r.querySelector(`${T('r-pay')}:disabled`))
          h.ctx.payLoanId = row ? Number(row.dataset.loanId) : null
        }
      },
      target: (c) => (c.payLoanId ? `${T('r-loan')}[data-loan-id="${c.payLoanId}"]` : T('r-card')),
      action: async (h) => {
        if (!h.ctx.payLoanId) return
        const sel = `${T('r-loan')}[data-loan-id="${h.ctx.payLoanId}"]`
        const row = await h.waitFor(sel)
        h.commit()
        h.click(row.querySelector(T('r-pay')))
        const res = await h.waitFor(`${sel} ${T('r-result')}`, { timeout: 15000 })
        h.ctx.payResult = res.textContent.replace(/\s+/g, ' ').trim()
      },
      text: (c) => `${c.payResult ? `${c.payResult}. ` : ''}The payment is recorded as on time or late, the wallet and loan balance go down, and the score is recalculated, all in one transaction. A loan the wallet cannot cover is blocked with a message, but the others stay payable.`,
    },
    {
      title: 'End of the borrower tour',
      act: 'Demo complete.',
      path: null,
      target: null,
      text: 'That is the whole borrower journey: an explained score, a loan request to a chosen lender, and a repayment that updates the score. Try the lender tour next, or the end-to-end tour to see a request approved.',
    },
  ],
}

const lenderTour = {
  id: 'lender',
  title: 'Lender: partnerships, borrowers and requests',
  blurb: 'What a lender sees: reputation, self-help groups, partnerships and members, eligible borrowers, incoming requests and offers. Does not change any data.',
  steps: [
    {
      title: 'The lender’s view',
      act: 'Opening the home page.',
      path: '/',
      target: T('home-hero'),
      text: (c) => `This tour shows the lender's side, as ${c.accounts.lender.name}. It only looks around and does not change any data.`,
    },
    loginStep('lender', 'lender', T('l-rep'),
      'Lenders log in with a username made from their name, in lowercase with dashes. The demo password is password123.'),
    {
      title: 'Reputation score',
      act: 'Highlighting the reputation card.',
      role: 'lender',
      path: '/lender',
      target: T('l-rep'),
      text: 'Each lender gets a reputation from 0 to 100, where 50 is the platform average. Lower interest rates than the average, more activity on the platform, and willingness to lend to independent borrowers all raise it. Borrowers see it next to each lender, so cheaper lending is rewarded.',
    },
    {
      title: 'Self-help groups by district',
      act: 'Choosing a district in the filter.',
      role: 'lender',
      path: '/lender',
      target: T('l-shgs'),
      setup: async (h) => {
        const sel = await h.waitFor(`${T('l-shgs')} select`)
        const opt = sel.options[1]
        if (opt && sel.value !== opt.value) h.set(sel, opt.value)
      },
      text: 'A lender can browse every self-help group by area. This list is a summary only: name, village, district and number of members. Member details stay private until a partnership is approved.',
    },
    {
      title: 'Asking a group for a partnership',
      act: 'Highlighting the partnership request.',
      role: 'lender',
      path: '/lender',
      target: T('l-link-request'),
      text: 'A lender can ask a group to partner with it, and a group can ask a lender. Only the side that did not send the request can approve it. The tour does not send one here, so it does not leave a pending request behind.',
    },
    {
      title: 'Linked groups',
      act: 'Highlighting approved and pending partnerships.',
      role: 'lender',
      path: '/lender',
      target: T('l-links'),
      text: 'Approved partnerships are listed first. Below them are requests from groups waiting for this lender\'s decision, and the lender\'s own requests waiting for a group.',
    },
    {
      title: 'Members of a partner group',
      act: 'Pressing View members on an approved group.',
      role: 'lender',
      path: '/lender',
      setup: async (h) => {
        if (h.$(T('l-members'))) return
        const btn = await h.waitFor(T('l-view-members'), { timeout: 6000 }).catch(() => null)
        if (btn) {
          h.click(btn)
          await h.waitFor(T('l-members'))
        }
      },
      target: (c, h) => (h.$(T('l-members')) ? T('l-members') : T('l-links')),
      text: 'Because this partnership is approved, the lender can see each member and their score. Without an approved partnership the server refuses this request.',
    },
    {
      title: 'Eligible borrowers',
      act: 'Opening the offer form for the first eligible borrower.',
      role: 'lender',
      path: '/lender',
      setup: async (h) => {
        if (h.$(T('l-offer-form'))) return
        const btn = await h.waitFor(T('l-propose'), { timeout: 6000 }).catch(() => null)
        if (btn) h.click(btn)
        await h.sleep(300)
      },
      target: (c, h) => (h.$(T('l-offer-form')) ? [T('l-eligible'), T('l-offer-form')] : T('l-eligible')),
      text: 'These are borrowers the lender may lend to: members of partner groups, plus independent borrowers if the lender serves them, who meet its minimum score. The lender can propose an offer with an amount, a rate and a tenure. The tour opens the form but does not send it.',
    },
    {
      title: 'Incoming loan requests',
      act: 'Highlighting the request queue.',
      role: 'lender',
      path: '/lender',
      target: T('l-requests'),
      text: 'Requests from borrowers arrive here. Approving one with an interest rate creates the loan at once. Declining only removes it from this lender\'s queue, so the borrower is not stuck. The end-to-end tour shows an approval live.',
    },
    {
      title: 'Offers sent',
      act: 'Highlighting the lender’s offers.',
      role: 'lender',
      path: '/lender',
      target: T('l-offers'),
      text: 'Offers this lender has made, with their status. When a borrower accepts one, the loan is created.',
    },
    {
      title: 'End of the lender tour',
      act: 'Demo complete.',
      path: null,
      target: null,
      text: 'A lender works only with groups it has partnered with and borrowers who meet its terms, and it is rewarded for cheaper lending. Try the self-help group tour next.',
    },
  ],
}

const shgTour = {
  id: 'shg',
  title: 'Self-help group: stats, lender partnerships, members',
  blurb: 'What a self-help group sees: its own statistics, its lender partnerships and who decides them, and its members’ scores. Does not change any data.',
  steps: [
    {
      title: 'The self-help group’s view',
      act: 'Opening the home page.',
      path: '/',
      target: T('home-hero'),
      text: (c) => `This tour shows the group's side, as ${c.accounts.shg.name}. It only looks around and does not change any data.`,
    },
    loginStep('shg', 'self-help group', T('s-stats'),
      'A group logs in with a username made from its name, in lowercase with dashes. The demo password is password123.'),
    {
      title: 'Group statistics',
      act: 'Highlighting the group statistics.',
      role: 'shg',
      path: '/shg',
      target: T('s-stats'),
      text: 'The group\'s members, their average score, and the group\'s repayment and meeting attendance rates. The repayment record matters most: it is what gives each new member their head start.',
    },
    {
      title: 'Lender partnerships',
      act: 'Highlighting the linked lenders.',
      role: 'shg',
      path: '/shg',
      target: T('s-links'),
      text: 'Each partnership is Pending, Approved or Rejected. Approving a lender lets it see the members and lets the members borrow from it. The group can approve or reject only requests that a lender started. Its own requests wait for the lender.',
    },
    {
      title: 'Asking a lender for a partnership',
      act: 'Highlighting the request box.',
      role: 'shg',
      path: '/shg',
      target: T('s-link-request'),
      text: 'The group can also ask a lender to partner with it. The tour does not send a request, so it does not leave one pending.',
    },
    {
      title: 'Members and their scores',
      act: 'Highlighting the member list.',
      role: 'shg',
      path: '/shg',
      target: T('s-members'),
      text: 'Every member and their own score. Each member has an individual score, not a copy of the group\'s. The group\'s record only gives a fair starting point.',
    },
    {
      title: 'End of the group tour',
      act: 'Demo complete.',
      path: null,
      target: null,
      text: 'A group sees its own members and decides which lenders it works with. Try the admin tour next for the platform-wide view.',
    },
  ],
}

const adminTour = {
  id: 'admin',
  title: 'Bank / admin: platform-wide oversight',
  blurb: 'The read-only admin view: portfolio, loans, anomaly flags, district trust map, model health, partnerships and borrower search. Does not change any data.',
  steps: [
    {
      title: 'The admin’s view',
      act: 'Opening the home page.',
      path: '/',
      target: T('home-hero'),
      text: 'This tour shows the bank or platform admin, who has a read-only view across everyone. It does not change any data.',
    },
    loginStep('admin', 'bank admin', T('a-portfolio'),
      'The admin logs in with the demo username admin and password admin123.'),
    {
      title: 'Portfolio overview',
      act: 'Highlighting the portfolio figures.',
      role: 'admin',
      path: '/admin',
      target: T('a-portfolio'),
      text: 'Totals for the whole platform: borrowers, how many are in a self-help group and how many are independent, groups, lenders and districts, and the average score of each kind of borrower.',
    },
    {
      title: 'Loan status',
      act: 'Highlighting the loan status chart.',
      role: 'admin',
      path: '/admin',
      target: T('a-loans'),
      text: 'Every loan on the platform by status, with the overall default rate.',
    },
    {
      title: 'Anomaly flags',
      act: 'Highlighting the anomaly flags.',
      role: 'admin',
      path: '/admin',
      target: T('a-anomalies'),
      text: 'An isolation forest flags borrowers whose repayment and savings behaviour is unusual. A flag means someone should take a look. It does not lower anyone\'s score.',
    },
    {
      title: 'District trust map',
      act: 'Highlighting the district heatmap.',
      role: 'admin',
      path: '/admin',
      target: T('a-heatmap'),
      text: 'Districts are grouped into trust levels with k-means clustering on their average score, default rate and group density. It shows where lending is going well and where it needs attention.',
    },
    {
      title: 'Model health',
      act: 'Highlighting the model health card.',
      role: 'admin',
      path: '/admin',
      target: T('a-model'),
      text: 'The scoring model\'s accuracy and its most important factors, read from the last training run. The model is trained so that a worse repayment record can never give a better score.',
    },
    {
      title: 'All partnerships',
      act: 'Highlighting the partnership overview.',
      role: 'admin',
      path: '/admin',
      target: T('a-links'),
      text: 'Every group-to-lender partnership on the platform. The admin can see them but cannot decide them. That decision belongs to the group and the lender.',
    },
    {
      title: 'Searching borrowers',
      act: 'Typing a borrower’s name into the search box.',
      role: 'admin',
      path: '/admin',
      setup: async (h) => {
        const input = await h.waitFor(T('a-search'))
        const name = h.ctx.accounts.borrower.name
        if (input.value !== name) await h.type(input, name, { delay: 40 })
        await h.sleep(700)
      },
      target: T('a-borrowers'),
      text: 'The admin can search the whole population by name or phone and open any borrower. This is the only role that can see across all borrowers, and it is read-only.',
    },
    {
      title: 'End of the admin tour',
      act: 'Demo complete.',
      path: null,
      target: null,
      text: 'The admin oversees the platform without taking decisions that belong to lenders and groups. Try the end-to-end tour to see all four roles working together.',
    },
  ],
}

export const TOURS = [storyTour, borrowerTour, lenderTour, shgTour, adminTour]
export const tourById = (id) => TOURS.find((t) => t.id === id)
