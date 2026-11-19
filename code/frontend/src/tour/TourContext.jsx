import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { credsFor, discoverAccounts } from './accounts'
import { $, $$, bringIntoView, click, setValue, sleep, typeInto, waitFor } from './dom'
import { TOURS, tourById } from './scripts'
import { rankedVoices, speak, speechSupported, stopSpeech } from './voice'

// Guided demo: picks a tour, then drives the real app step by step -- logging
// in as each role, navigating, typing and clicking -- while a panel at the
// bottom explains each step (with optional spoken narration). Modelled on the
// RL autoscaler demo: step counter, jump list, Previous / Next, auto-advance
// with a timer bar, voice on/off with a voice picker, hide text, close.

const TourContext = createContext(null)
const DASHBOARD_MARKER = {
  borrower: '[data-tour="b-score"]',
  lender: '[data-tour="l-rep"]',
  shg: '[data-tour="s-stats"]',
  admin: '[data-tour="a-portfolio"]',
}
const VOICE_KEY = 'creditsetu_tour_voice'

class Cancelled extends Error {}

const resolveTargets = (t, ctx, h) => {
  const v = typeof t === 'function' ? t(ctx, h) : t
  return (Array.isArray(v) ? v : [v]).filter(Boolean)
}

export function TourProvider({ children }) {
  const navigate = useNavigate()
  const { auth, login } = useAuth()
  const authRef = useRef(auth)
  authRef.current = auth

  // Mutable engine state (not rendered).
  const E = useRef({ open: false, tok: 0, tour: null, i: 0, ctx: {}, done: new Set(), auto: true, voice: true, timer: null })
  const panelRef = useRef(null)
  const timerBarRef = useRef(null)

  const [chooserOpen, setChooserOpen] = useState(false)
  const [view, setView] = useState(null) // { tourId, i, title, act, text, status, error }
  const [auto, setAuto] = useState(true)
  const [voiceOn, setVoiceOn] = useState(true)
  const [minimised, setMinimised] = useState(false)
  const [voices, setVoices] = useState([])
  const [voiceName, setVoiceName] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) || ''
    } catch {
      return ''
    }
  })
  const voiceRef = useRef(null)

  // ------------------------------------------------------------- voices
  useEffect(() => {
    if (!speechSupported()) return undefined
    const load = () => setVoices(rankedVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  useEffect(() => {
    voiceRef.current = voices.find((v) => v.name === voiceName) || voices[0] || null
  }, [voices, voiceName])

  // ------------------------------------------------- highlight + padding
  const clearHighlight = () => $$('.tour-hl').forEach((n) => n.classList.remove('tour-hl'))
  const panelHeight = () => (panelRef.current ? panelRef.current.getBoundingClientRect().height : 0)
  const highlight = (sels) => {
    clearHighlight()
    const nodes = sels.flatMap((s) => $$(s))
    nodes.forEach((n) => n.classList.add('tour-hl'))
    bringIntoView(nodes, panelHeight())
    return nodes
  }
  useEffect(() => {
    if (!view || !panelRef.current) {
      document.body.style.paddingBottom = ''
      return undefined
    }
    const ro = new ResizeObserver(() => {
      document.body.style.paddingBottom = `${Math.ceil(panelHeight()) + 16}px`
    })
    ro.observe(panelRef.current)
    return () => ro.disconnect()
  }, [view])

  // ---------------------------------------------------------- timers
  const timerOff = () => {
    clearTimeout(E.current.timer)
    const b = timerBarRef.current
    if (b) {
      b.style.transition = 'none'
      b.style.width = '0%'
    }
  }
  const armAuto = (ms, tok) => {
    timerOff()
    const e = E.current
    if (!e.auto || !e.open || e.i >= e.tour.steps.length - 1) return
    const b = timerBarRef.current
    if (b) {
      void b.offsetWidth
      b.style.transition = `width ${ms}ms linear`
      b.style.width = '100%'
    }
    e.timer = setTimeout(() => {
      if (tok === e.tok && e.open && e.auto) go(e.i + 1) // eslint-disable-line no-use-before-define
    }, ms)
  }

  // --------------------------------------------------- session helpers
  const ensureSession = async (role) => {
    const e = E.current
    const cur = authRef.current
    const acct = role === 'borrower' ? e.ctx.accounts.borrower : role === 'lender' ? e.ctx.accounts.lender : role === 'shg' ? e.ctx.accounts.shg : null
    if (cur?.role === role && (!acct || cur.id === acct.id)) return
    const res = await api.authLogin(role, credsFor(role, e.ctx.accounts).body)
    const id = res.individual_id ?? res.lender_id ?? res.shg_id ?? null
    login(role, res.token, id, res.name)
    await sleep(120)
  }

  const waitForPath = async (path) => {
    const started = Date.now()
    while (window.location.pathname !== path) {
      if (Date.now() - started > 8000) throw new Error(`Could not open ${path}`)
      await sleep(80)
    }
  }

  // ------------------------------------------------------------- go(i)
  const go = useCallback(async (index) => {
    const e = E.current
    if (!e.open || !e.tour) return
    const steps = e.tour.steps
    const i = Math.max(0, Math.min(steps.length - 1, index))
    e.tok += 1
    const tok = e.tok
    e.i = i
    timerOff()
    stopSpeech()
    clearHighlight()
    const step = steps[i]
    const alive = () => tok === E.current.tok && E.current.open
    const guard = () => {
      if (!alive()) throw new Cancelled()
    }
    setView({ tourId: e.tour.id, i, title: step.title, act: step.act, text: '', status: 'working', error: null })
    const key = `${e.tour.id}:${i}`

    const h = {
      ctx: e.ctx,
      // Scripts call this right before an irreversible click (submit, approve,
      // pay...), so the action is never repeated even if a later wait fails.
      commit: () => e.done.add(key),
      $,
      $$,
      sleep: async (ms) => {
        await sleep(ms)
        guard()
      },
      waitFor: async (sel, opts) => {
        const el = await waitFor(sel, opts)
        guard()
        return el
      },
      type: async (el, text, opts = {}) => {
        guard()
        await typeInto(el, text, { ...opts, alive })
        guard()
      },
      set: (el, value) => {
        guard()
        setValue(el, value)
      },
      click: (el) => {
        guard()
        click(el)
      },
      bring: (nodes) => bringIntoView(nodes, panelHeight()),
    }
    const setNote = (text) => alive() && setView((v) => (v ? { ...v, text } : v))

    try {
      if (!e.ctx.accounts) {
        setNote('Preparing demo accounts from the current data...')
        e.ctx.accounts = await discoverAccounts({ onProgress: setNote })
        guard()
      }

      if (step.login) {
        // Log in through the real login form, so the audience sees it.
        const creds = credsFor(step.login, e.ctx.accounts)
        navigate(`/login/${step.login}`)
        await waitForPath(`/login/${step.login}`)
        const idEl = await h.waitFor('#login-id')
        highlight(resolveTargets(step.target, e.ctx, h))
        await h.type(idEl, creds.idValue)
        await h.type(await h.waitFor('#login-pw'), creds.password, { delay: 55 })
        await h.sleep(350)
        h.click(await h.waitFor('[data-tour="login-submit"]'))
        await h.waitFor(DASHBOARD_MARKER[step.login], { timeout: 15000 })
      } else {
        if (step.role) await ensureSession(step.role)
        guard()
        if (step.path && window.location.pathname !== step.path) {
          navigate(step.path)
          await waitForPath(step.path)
        }
        guard()
      }

      if (step.setup) await step.setup(h)
      guard()

      // Highlight what the step is about (wait briefly for data to load).
      const pre = resolveTargets(step.target, e.ctx, h)
      if (pre.length) {
        await waitFor(pre.join(', '), { timeout: 8000 }).catch(() => null)
        guard()
        highlight(resolveTargets(step.target, e.ctx, h))
      }

      if (step.action && !e.done.has(key)) {
        await step.action(h)
        guard()
        e.done.add(key)
      }

      const post = resolveTargets(step.after || step.target, e.ctx, h)
      if (post.length) {
        await waitFor(post.join(', '), { timeout: 6000 }).catch(() => null)
        guard()
        highlight(post)
      } else {
        clearHighlight()
      }

      const text = typeof step.text === 'function' ? step.text(e.ctx, h) : step.text
      setView((v) => ({ ...v, text, status: 'ready' }))

      if (e.voice && speechSupported()) {
        const ok = await speak(step.title, text, voiceRef.current, alive)
        if (ok && alive()) armAuto(1600, tok)
      } else {
        const words = `${step.title} ${text}`.split(/\s+/).length
        armAuto(Math.max(6000, words * 300 + 1500), tok)
      }
    } catch (err) {
      if (err instanceof Cancelled || !alive()) return
      e.auto = false
      setAuto(false)
      setView((v) => ({
        ...v,
        status: 'error',
        error: err.message || String(err),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, login])

  // ------------------------------------------------------------ controls
  const start = useCallback((tourId) => {
    const e = E.current
    e.tour = tourById(tourId)
    e.open = true
    e.done = new Set()
    e.ctx = { accounts: e.ctx.accounts } // keep discovered accounts, reset per-run values
    e.auto = true
    setAuto(true)
    setMinimised(false)
    setChooserOpen(false)
    go(0)
  }, [go])

  const close = useCallback(() => {
    const e = E.current
    e.open = false
    e.tok += 1
    timerOff()
    stopSpeech()
    clearHighlight()
    setView(null)
    document.body.style.paddingBottom = ''
  }, [])

  const toggleAuto = () => {
    const e = E.current
    e.auto = !e.auto
    setAuto(e.auto)
    if (!e.auto) timerOff()
    else if (view?.status === 'ready') armAuto(2500, e.tok)
  }

  const toggleVoice = () => {
    const e = E.current
    e.voice = !e.voice
    setVoiceOn(e.voice)
    if (!e.voice) {
      stopSpeech()
      if (view?.status === 'ready' && e.auto) armAuto(4000, e.tok)
    } else if (view?.status === 'ready') {
      const tok = e.tok
      timerOff()
      speak(view.title, view.text, voiceRef.current, () => tok === E.current.tok && E.current.open)
        .then((ok) => ok && armAuto(1600, tok))
    }
  }

  const chooseVoice = (name) => {
    setVoiceName(name)
    try {
      localStorage.setItem(VOICE_KEY, name)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!chooserOpen) return undefined
    const onKey = (ev) => ev.key === 'Escape' && setChooserOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chooserOpen])

  useEffect(() => () => stopSpeech(), [])

  const value = { openChooser: () => setChooserOpen(true), start, close, active: !!view }
  const tour = view ? tourById(view.tourId) : null
  const n = tour?.steps.length || 0
  const working = view?.status === 'working'
  const last = view && view.i === n - 1

  return (
    <TourContext.Provider value={value}>
      {children}

      {chooserOpen && (
        <div className="tour-modal-backdrop" onClick={() => setChooserOpen(false)}>
          <div className="tour-modal card" role="dialog" aria-modal="true" aria-label="Choose a guided demo" onClick={(ev) => ev.stopPropagation()}>
            <div className="tour-modal-head">
              <h2 style={{ margin: 0 }}>Guided demo</h2>
              <button className="btn" onClick={() => setChooserOpen(false)}>Close</button>
            </div>
            <p className="card-sub">
              Pick a tour. It logs in as each role with the seeded demo accounts and clicks through the real app,
              explaining every step. Use Previous and Next to move at your own pace, or let it play.
            </p>
            <div className="tour-choices">
              {TOURS.map((t) => (
                <button key={t.id} type="button" className="tour-choice" onClick={() => start(t.id)}>
                  <span className="tour-choice-title">{t.title}</span>
                  <span className="tour-choice-blurb">{t.blurb}</span>
                  <span className="tour-choice-meta">{t.steps.length} steps &rarr;</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view && (
        <aside className={`tour-panel${minimised ? ' min' : ''}`} ref={panelRef} role="dialog" aria-label="Guided demo">
          <div className="tour-in">
            <div className="tour-top">
              <span className="tour-count">Step {view.i + 1} of {n}</span>
              <select
                className="tour-jump"
                aria-label="Jump to a step"
                value={view.i}
                disabled={working}
                onChange={(ev) => go(Number(ev.target.value))}
              >
                {tour.steps.map((s, k) => <option key={k} value={k}>{k + 1}. {s.title}</option>)}
              </select>
              <div className="tour-tools">
                <button type="button" className="btn tbtn" onClick={toggleAuto}>{auto ? 'Pause' : 'Auto-play'}</button>
                {speechSupported() && voiceOn && voices.length > 0 && (
                  <select className="tour-voice" aria-label="Choose a voice" value={voiceRef.current?.name || ''} onChange={(ev) => chooseVoice(ev.target.value)}>
                    {voices.map((v) => <option key={v.name} value={v.name}>{v.name.replace(/^Microsoft\s+/, '')} ({v.lang})</option>)}
                  </select>
                )}
                <button type="button" className="btn tbtn" onClick={toggleVoice} disabled={!speechSupported()}>
                  {!speechSupported() ? 'No voice' : voiceOn ? 'Voice on' : 'Voice off'}
                </button>
                <button type="button" className="btn tbtn" onClick={() => setMinimised((m) => !m)}>{minimised ? 'Show text' : 'Hide text'}</button>
                <button type="button" className="btn tbtn" onClick={close}>Close</button>
              </div>
            </div>
            <div className="tour-track" aria-hidden="true"><i style={{ width: `${((view.i + 1) / n) * 100}%` }} /></div>
            <p className="tour-tourname">{tour.title}</p>
            <h3 className="tour-title">{view.title}</h3>
            <p className="tour-act"><b>Action</b><span>{view.act}</span></p>
            <p className="tour-txt" aria-live="polite">
              {working ? <span className="muted">{view.text || 'Working on it...'}</span> : view.text}
            </p>
            {view.error && (
              <div className="error-banner tour-error">
                This step could not finish: {view.error}. Press Next to skip it, or Previous to try again.
              </div>
            )}
            <div className="tour-nav">
              <button type="button" className="btn tbtn" disabled={working || view.i === 0} onClick={() => go(view.i - 1)}>Previous</button>
              <div className="tour-timer" aria-hidden="true"><i ref={timerBarRef} /></div>
              <button type="button" className="btn primary tbtn" disabled={working} onClick={() => (last ? close() : go(view.i + 1))}>
                {last ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </aside>
      )}
    </TourContext.Provider>
  )
}

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourProvider')
  return ctx
}
