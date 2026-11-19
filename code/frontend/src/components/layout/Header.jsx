import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useTour } from '../../tour/TourContext'

const ROLE_NAV = [
  { role: 'borrower', label: 'Borrower' },
  { role: 'lender', label: 'Lender' },
  { role: 'shg', label: 'SHG' },
  { role: 'admin', label: 'Bank / Admin' },
]
const DASHBOARD_PATH = { borrower: '/borrower', lender: '/lender', shg: '/shg', admin: '/admin' }

export default function Header() {
  const { auth, logout } = useAuth()
  const { openChooser } = useTour()
  const navigate = useNavigate()
  const [contrast, setContrast] = useState(() => {
    try {
      return document.documentElement.getAttribute('data-contrast') === 'high'
    } catch {
      return false
    }
  })
  // index.html already forces data-theme="light" before first paint, so
  // every fresh visit opens light regardless of system preference -- this
  // just tracks whether the toggle below has switched it to dark this
  // session (not persisted, by design: it resets to light on next visit).
  const [dark, setDark] = useState(() => {
    try {
      return document.documentElement.getAttribute('data-theme') === 'dark'
    } catch {
      return false
    }
  })

  const toggleContrast = () => {
    const next = !contrast
    setContrast(next)
    document.documentElement.setAttribute('data-contrast', next ? 'high' : 'normal')
  }

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <div className="utility-bar">
        <div className="utility-bar-inner">
          <span className="utility-note">Government-portal-style demonstration platform</span>
          <div className="utility-controls">
            <button type="button" className="utility-link">EN / हिं</button>
            <button type="button" className="utility-link" aria-label="Decrease text size">A-</button>
            <button type="button" className="utility-link" aria-label="Reset text size">A</button>
            <button type="button" className="utility-link" aria-label="Increase text size">A+</button>
            <button type="button" className="utility-link" onClick={toggleContrast} aria-pressed={contrast}>
              High contrast
            </button>
            <button type="button" className="utility-link" onClick={toggleDark} aria-pressed={dark}>
              {dark ? 'Light mode' : 'Dark mode'}
            </button>
            <button type="button" className="utility-link">Screen Reader Access</button>
          </div>
        </div>
      </div>

      <div className="brand-strip">
        <div className="brand-strip-inner">
          <NavLink to="/" end className="app-title" style={{ textDecoration: 'none' }}>
            <span className="brand-mark" aria-hidden="true">CS</span>
            <span>
              CreditSetu
              <span className="sub">Microfinance Credit Scoring &mdash; Demonstration Platform</span>
            </span>
          </NavLink>
          {auth && (
            <div className="session-note">
              <span className="muted small">Signed in as {auth.name} ({auth.role})</span>
              <button className="btn" onClick={handleLogout}>Log out</button>
            </div>
          )}
        </div>
        <div className="tricolor-rule" aria-hidden="true" />
      </div>

      <nav className="main-nav" aria-label="Primary">
        <div className="main-nav-inner">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Home</NavLink>
          {ROLE_NAV.map(({ role, label }) => {
            const isActiveRole = auth?.role === role
            const to = isActiveRole ? DASHBOARD_PATH[role] : `/login/${role}`
            return (
              <NavLink key={role} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {label}
              </NavLink>
            )
          })}
          <button type="button" className="nav-demo-btn" onClick={openChooser}>&#9654; Guided demo</button>
        </div>
      </nav>
    </>
  )
}
