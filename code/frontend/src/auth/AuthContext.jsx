import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../api/client'

const AuthContext = createContext(null)
const STORAGE_KEY = 'mfin_auth_session'

/** Single active session at a time, for any one of the four roles (borrower /
 * lender / shg / admin) -- matches the product requirement of four separate,
 * never-combined logins. Persisted to localStorage so a refresh doesn't log
 * you out; re-validated against the server on mount (GET /api/auth/{role}/me)
 * so an expired/revoked token drops back to the login screen instead of
 * showing stale cached data. */
export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!auth) {
      setChecked(true)
      return
    }
    api
      .authMe(auth.role, auth.token)
      .then(() => setChecked(true))
      .catch(() => {
        setAuth(null)
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          // ignore
        }
        setChecked(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const login = useCallback((role, token, id, name) => {
    const next = { role, token, id, name }
    setAuth(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }, [])

  const logout = useCallback(async () => {
    if (auth) {
      try {
        await api.authLogout(auth.role, auth.token)
      } catch {
        // best-effort -- the session row expires on its own either way
      }
    }
    setAuth(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [auth])

  return <AuthContext.Provider value={{ auth, checked, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
