import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import Breadcrumb from '../../components/Breadcrumb'

const ROLE_META = {
  borrower: {
    label: 'Borrower',
    idField: 'phone',
    idLabel: 'Phone number',
    dashboard: '/borrower',
    hint: "Use the phone number on your profile. This is demo data -- every seeded borrower's password is password123.",
  },
  lender: {
    label: 'Lender',
    idField: 'username',
    idLabel: 'Username',
    dashboard: '/lender',
    hint: 'Demo data -- every seeded lender account uses password123. Username is a slug of the lender name.',
  },
  shg: {
    label: 'Self-Help Group',
    idField: 'username',
    idLabel: 'Username',
    dashboard: '/shg',
    hint: 'Demo data -- every seeded SHG account uses password123. Username is a slug of the group name.',
  },
  admin: {
    label: 'Bank / Admin',
    idField: 'username',
    idLabel: 'Username',
    dashboard: '/admin',
    hint: 'Demo credentials: admin / admin123. This is a read-only, platform-wide oversight view.',
  },
}

export default function LoginPage({ role }) {
  const meta = ROLE_META[role]
  const [idValue, setIdValue] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.authLogin(role, { [meta.idField]: idValue.trim(), password })
      const id = res.individual_id ?? res.lender_id ?? res.shg_id ?? null
      login(role, res.token, id, res.name)
      navigate(location.state?.from || meta.dashboard, { replace: true })
    } catch (err) {
      setError(err.message.includes('401') ? 'Incorrect credentials.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: `${meta.label} Login` }]} />
      <h1>{meta.label} login</h1>
      <p className="page-intro">
        CreditSetu uses four separate, role-gated logins -- each role only ever sees its own data, never anyone
        else's.
      </p>
      <div className="card" style={{ maxWidth: 420 }} data-tour="login-card">
        <h2>Log in</h2>
        <p className="card-sub">{meta.hint}</p>
        <form onSubmit={submit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="field-label" htmlFor="login-id">{meta.idLabel}</label>
            <input
              id="login-id"
              placeholder={meta.idLabel}
              value={idValue}
              onChange={(e) => setIdValue(e.target.value)}
              autoComplete="username"
            />
            <label className="field-label" htmlFor="login-pw">Password</label>
            <input
              id="login-pw"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error && <div className="error-banner" style={{ marginBottom: 0 }}>{error}</div>}
            <button className="btn primary" type="submit" disabled={busy || !idValue || !password} data-tour="login-submit">
              {busy ? 'Logging in...' : 'Log in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
