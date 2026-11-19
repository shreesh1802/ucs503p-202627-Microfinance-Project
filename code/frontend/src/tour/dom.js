// Small DOM helpers the guided demo uses to drive the real UI the same way a
// person would: wait for an element, type into it, pick an option, click.
// Inputs are React-controlled, so values are set through the native setter
// and followed by an 'input'/'change' event, which is what React listens to.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const $ = (sel) => (sel ? document.querySelector(sel) : null)
export const $$ = (sel) => (sel ? Array.from(document.querySelectorAll(sel)) : [])

/** Resolves with the first element matching `sel` (and `test`, if given), or
 * rejects after `timeout` ms with a readable message. */
export function waitFor(sel, { timeout = 10000, test } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const el = $$(sel).find((n) => (test ? test(n) : true))
      if (el) return resolve(el)
      if (Date.now() - started > timeout) return reject(new Error(`Timed out waiting for ${sel}`))
      setTimeout(tick, 120)
    }
    tick()
  })
}

const nativeSetter = (el) => {
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  return Object.getOwnPropertyDescriptor(proto, 'value').set
}

/** Set a controlled input/select's value in one go. */
export function setValue(el, value) {
  nativeSetter(el).call(el, String(value))
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

/** Type into a controlled input one character at a time, so the audience can
 * see it happen. Cancelled early if `alive()` turns false. */
export async function typeInto(el, text, { delay = 45, alive = () => true } = {}) {
  el.focus()
  setValue(el, '')
  let acc = ''
  for (const ch of String(text)) {
    if (!alive()) return
    acc += ch
    setValue(el, acc)
    await sleep(delay)
  }
}

export function click(el) {
  el.scrollIntoView({ block: 'nearest' })
  el.click()
}

/** Same rule as app/ml/migrate_auth.py::_slugify -- lender/SHG usernames. */
export function slugify(name) {
  return (name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'user'
}

/** Scroll so every node is visible above the tour panel at the bottom. */
export function bringIntoView(nodes, panelHeight) {
  if (!nodes.length) return
  let top = Infinity
  let bottom = -Infinity
  nodes.forEach((n) => {
    const r = n.getBoundingClientRect()
    top = Math.min(top, r.top)
    bottom = Math.max(bottom, r.bottom)
  })
  const header = 16
  const avail = window.innerHeight - panelHeight - header - 24
  const h = bottom - top
  const offset = h >= avail ? top - header : top - header - (avail - h) / 2
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: Math.max(0, window.scrollY + offset), behavior: calm ? 'auto' : 'smooth' })
}
