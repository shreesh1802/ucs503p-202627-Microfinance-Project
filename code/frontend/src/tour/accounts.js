import { api } from '../api/client'
import { slugify } from './dom'

// The seeded demo credentials, as documented on the login pages and in the
// README. Every seeded borrower, lender and SHG uses DEMO_PASSWORD.
export const DEMO_PASSWORD = 'password123'
export const ADMIN_CREDS = { username: 'admin', password: 'admin123' }
export const GATEWAY_CREDS = { username: 'abc', password: '123' } // RepayPage.jsx mock gateway
export const DEMO_LOAN = { principal: 15000, tenure: 12, purpose: 'Dairy cow (guided demo)', rate: 14 }

const STORE = 'creditsetu_tour_accounts'

async function tryLogin(role, body) {
  try {
    const res = await api.authLogin(role, body)
    api.authLogout(role, res.token).catch(() => {})
    return res
  } catch {
    return null
  }
}

/** Picks demo accounts from whatever data is in the database right now, so the
 * tour keeps working after the data is reseeded. Uses the admin API behind
 * the scenes (read-only calls) to find:
 *   - an SHG-linked borrower with a payable EMI the wallet covers, and at
 *     least one eligible lender;
 *   - one of those eligible lenders whose max loan covers the demo loan;
 *   - the borrower's own SHG.
 * Lender and SHG logins are checked before they're used. */
export async function discoverAccounts({ onProgress = () => {} } = {}) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(STORE) || 'null')
    if (cached?.borrower && cached?.lender && cached?.shg) {
      const ok = await tryLogin('borrower', { phone: cached.borrower.phone, password: DEMO_PASSWORD })
      if (ok) return cached
    }
  } catch {
    // ignore and rediscover
  }

  onProgress('Signing in as the admin to look up demo accounts...')
  const admin = await api.authLogin('admin', ADMIN_CREDS)
  const token = admin.token
  try {
    const [people, lenders] = await Promise.all([
      api.listIndividuals({ is_shg_linked: true, limit: 150 }, token),
      api.listLenders(token),
    ])
    const lenderById = Object.fromEntries(lenders.map((l) => [l.id, l]))
    const candidates = people.items
      .filter((p) => p.latest_score && p.phone)
      .sort((a, b) => (b.latest_score.score || 0) - (a.latest_score.score || 0))

    let checked = 0
    for (const p of candidates) {
      if (checked >= 40) break
      checked += 1
      onProgress(`Checking borrower ${checked} of ${Math.min(40, candidates.length)}...`)
      const elig = await api.eligibleLendersFor(p.id, token)
      const lendersOk = (elig.lenders || [])
        .map((l) => lenderById[l.id])
        .filter((l) => l && l.max_loan_amount >= DEMO_LOAN.principal)
      if (!lendersOk.length) continue
      const due = await api.dueSummary(p.id, token)
      const payable = (due.loans || []).filter((l) => l.payable)
      if (!payable.length || due.wallet_balance < 4000) continue

      let lender = null
      for (const l of lendersOk) {
        const username = slugify(l.name)
        if (await tryLogin('lender', { username, password: DEMO_PASSWORD })) {
          lender = { id: l.id, name: l.name, username, maxLoan: l.max_loan_amount }
          break
        }
      }
      if (!lender) continue
      const shgUsername = slugify(p.shg_name)
      if (!(await tryLogin('shg', { username: shgUsername, password: DEMO_PASSWORD }))) continue

      const accounts = {
        borrower: { id: p.id, name: p.name, phone: p.phone, shgName: p.shg_name },
        lender,
        shg: { id: p.shg_id, name: p.shg_name, username: shgUsername },
      }
      try {
        sessionStorage.setItem(STORE, JSON.stringify(accounts))
      } catch {
        // ignore
      }
      return accounts
    }
    throw new Error(
      'No suitable demo borrower found (needs an SHG member with a payable EMI and an eligible lender). ' +
      'Reseed with python -m app.ml.data_gen and run the migrations.',
    )
  } finally {
    api.authLogout('admin', token).catch(() => {})
  }
}

/** Credentials to log a given role in with. */
export function credsFor(role, accounts) {
  if (role === 'admin') return { idValue: ADMIN_CREDS.username, password: ADMIN_CREDS.password, body: ADMIN_CREDS }
  if (role === 'borrower') {
    const b = accounts.borrower
    return { idValue: b.phone, password: DEMO_PASSWORD, body: { phone: b.phone, password: DEMO_PASSWORD } }
  }
  const a = role === 'lender' ? accounts.lender : accounts.shg
  return { idValue: a.username, password: DEMO_PASSWORD, body: { username: a.username, password: DEMO_PASSWORD } }
}
