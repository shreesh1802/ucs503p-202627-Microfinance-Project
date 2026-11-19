// Narration with the browser's built-in speech synthesis. Prefers
// natural-sounding male English voices (the same ranking the RL autoscaler
// demo used); the user can pick another voice from the panel.

const FEMALE = /\bfemale\b|aria|jenny|zira|hazel|susan|sonia|libby|emma|michelle|ana\b|neerja|samantha|karen|moira|tessa|veena|fiona|victoria|allison|ava\b|nora|kalpana|heera|natasha|clara|mia\b|maisie|ada\b|olivia|catherine|linda|sara|swara/i
const MALE = /\bmale\b|guy|ryan|christopher|eric|brian|davis|andrew|roger|steffan|prabhat|ravi|rishi|daniel|alex\b|aaron|arthur|oliver|james|george|thomas|liam|william|mark|david|jason|tony|sam\b|jacob|madhur|hemant/i
const ROBOT = /\bfred\b|ralph|junior|bad news|whisper|zarvox|trinoids|boing|bells|cellos|albert|organ|bubbles|deranged|hysterical|good news|kathy|superstar/i

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

export const isNatural = (v) => /natural|neural|online|enhanced|premium/i.test(v.name)

function scoreVoice(v) {
  let s = 0
  const n = v.name
  if (/^en/i.test(v.lang)) s += 100
  if (isNatural(v)) s += 60
  if (!FEMALE.test(n) && MALE.test(n)) s += 40
  if (FEMALE.test(n)) s -= 40
  if (/desktop/i.test(n)) s -= 25
  if (ROBOT.test(n)) s -= 200
  if (/en-(IN|US|GB|AU)/i.test(v.lang)) s += 5
  if (/en-IN/i.test(v.lang)) s += 3
  return s
}

/** English voices, best first. */
export function rankedVoices() {
  if (!speechSupported()) return []
  return (window.speechSynthesis.getVoices() || [])
    .filter((v) => /^en/i.test(v.lang))
    .map((v) => ({ v, s: scoreVoice(v) }))
    .sort((a, b) => b.s - a.s)
    .map((o) => o.v)
}

export function stopSpeech() {
  try {
    if (speechSupported()) window.speechSynthesis.cancel()
  } catch {
    // ignore
  }
}

/** Spell out what a speech engine would otherwise mangle. */
function forSpeech(t) {
  return t
    .replace(/[✓✔▲●]/g, '')
    .replace(/\s+--\s+/g, ', ')
    .replace(/\s*·\s*/g, ', ')
    .replace(/Rs\.\s?/g, 'rupees ')
    .replace(/\bSHGs\b/g, 'S H Gs')
    .replace(/\bSHG\b/g, 'S H G')
    .replace(/\bEMI\b/g, 'E M I')
    .replace(/\bEMIs\b/g, 'E M Is')
    .replace(/\bSHAP\b/g, 'shap')
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/(\d)%/g, '$1 percent')
    .replace(/\bvs\.?\s/g, 'versus ')
    .replace(/->|→/g, ' to ')
}

/** Speak the title, then the body one sentence at a time. Resolves true if it
 * finished, false if it was cancelled (`alive()` false) or failed. */
export function speak(title, body, voice, alive) {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve(false)
    stopSpeech()
    const parts = [title, ...forSpeech(body).replace(/([.!?])\s+/g, '$1|').split('|')]
      .map((p) => p.trim())
      .filter(Boolean)
    let i = 0
    let done = false
    const guard = setTimeout(() => finish(alive()), parts.join(' ').split(' ').length * 480 + 6000)
    function finish(ok) {
      if (done) return
      done = true
      clearTimeout(guard)
      resolve(ok)
    }
    function next() {
      if (!alive()) return finish(false)
      if (i >= parts.length) return finish(true)
      const u = new SpeechSynthesisUtterance(parts[i])
      const nat = voice && isNatural(voice)
      if (voice) {
        u.voice = voice
        u.lang = voice.lang
      }
      u.rate = nat ? 1 : 0.95
      u.pitch = nat ? 1 : 0.92
      u.onend = () => {
        i += 1
        setTimeout(next, i === 1 ? 450 : 160)
      }
      u.onerror = () => finish(alive())
      try {
        window.speechSynthesis.speak(u)
      } catch {
        finish(false)
      }
    }
    next()
  })
}
