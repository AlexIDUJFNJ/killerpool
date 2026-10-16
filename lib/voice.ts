/**
 * The commentator's voice, through the browser's speechSynthesis.
 *
 * It keeps a queue of its own instead of handing every line to the browser,
 * whose queue plays everything it is given, however stale. A line never cuts
 * the one being spoken off mid-word: it waits for it. But only the newest
 * waits — when several lines pile up behind one that is still being spoken,
 * the older ones are dropped, so the voice never lags shots behind the table.
 *
 * Where there is no speechSynthesis, every function here does nothing.
 */

/** Spoken a little brisker than the default, like a commentator */
const RATE = 1.05

/**
 * Some engines (Chrome among them) now and then never fire `end`. Past this
 * long the line is taken as finished, so the queue cannot stall for good.
 */
function watchdogMs(text: string): number {
  return Math.min(15_000, 2_500 + text.length * 100)
}

let current: SpeechSynthesisUtterance | null = null
let waiting: string | null = null
let watchdog: ReturnType<typeof setTimeout> | null = null
let scheduled: ReturnType<typeof setTimeout> | null = null
/** undefined until chosen; null when the browser has no English voice */
let chosenVoice: SpeechSynthesisVoice | null | undefined
let listeningForVoices = false
let unlocked = false

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
    return null
  }
  return window.speechSynthesis
}

/** Whether this browser can speak at all */
export function isVoiceSupported(): boolean {
  return getSynth() !== null
}

// macOS ships joke voices under English locales; none of them is a commentator
const NOVELTY_VOICES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox/i

/**
 * The English voice to commentate with. British English first — this is a
 * pub game — then the other English accents, a voice that works offline over
 * one that needs the network, and never one of the novelty voices.
 */
export function pickEnglishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const score = (voice: SpeechSynthesisVoice): number => {
    const lang = voice.lang.replace('_', '-').toLowerCase()
    let points = 0
    if (lang === 'en-gb') points += 4
    else if (lang === 'en-au' || lang === 'en-ie') points += 3
    else if (lang === 'en-us') points += 2
    if (voice.localService) points += 1
    if (NOVELTY_VOICES.test(voice.name)) points -= 10
    return points
  }

  let best: SpeechSynthesisVoice | null = null
  for (const voice of voices) {
    if (!/^en([-_]|$)/i.test(voice.lang)) continue
    if (!best || score(voice) > score(best)) best = voice
  }
  return best
}

function getVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  // The list arrives asynchronously in Chrome, and can change later
  if (!listeningForVoices && typeof synth.addEventListener === 'function') {
    listeningForVoices = true
    synth.addEventListener('voiceschanged', () => {
      chosenVoice = undefined
    })
  }
  if (chosenVoice === undefined) {
    const voices = synth.getVoices()
    // Not loaded yet: speak with the default voice and look again next time
    if (voices.length === 0) return null
    chosenVoice = pickEnglishVoice(voices)
  }
  return chosenVoice
}

function clearWatchdog(): void {
  if (watchdog) clearTimeout(watchdog)
  watchdog = null
}

function start(synth: SpeechSynthesis, text: string): void {
  let utterance: SpeechSynthesisUtterance
  try {
    utterance = new SpeechSynthesisUtterance(text)
  } catch {
    return
  }

  const voice = getVoice(synth)
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? 'en-GB'
  utterance.rate = RATE

  const finish = () => {
    // A line dropped by stopVoice, or already finished by the watchdog
    if (current !== utterance) return
    current = null
    clearWatchdog()
    const next = waiting
    waiting = null
    if (next) start(synth, next)
  }
  utterance.onend = finish
  utterance.onerror = finish

  // Kept in module scope as well: Chrome has been known to garbage-collect an
  // utterance nobody holds, and then it never ends
  current = utterance
  watchdog = setTimeout(finish, watchdogMs(text))
  try {
    synth.speak(utterance)
  } catch {
    finish()
  }
}

function sayNow(text: string): void {
  const synth = getSynth()
  if (!synth) return
  if (current) {
    // Waits for the line being spoken; whatever waited before is dropped
    waiting = text
    return
  }
  start(synth, text)
}

/**
 * Say a line. After `delayMs`, if given — the voice can wait for a sound
 * effect to make room. A line still waiting for its delay is replaced by the
 * next one asked for.
 */
export function speak(text: string, delayMs = 0): void {
  if (!text.trim() || !getSynth()) return
  if (scheduled) clearTimeout(scheduled)
  scheduled = null
  if (delayMs > 0) {
    scheduled = setTimeout(() => {
      scheduled = null
      sayNow(text)
    }, delayMs)
    return
  }
  sayNow(text)
}

/** Drop every line not spoken yet, and silence the one being spoken */
export function stopVoice(): void {
  if (scheduled) clearTimeout(scheduled)
  scheduled = null
  waiting = null
  const wasSpeaking = current !== null
  current = null
  clearWatchdog()
  const synth = getSynth()
  if (synth && wasSpeaking) {
    try {
      synth.cancel()
    } catch {
      // Nothing to cancel
    }
  }
}

/**
 * Call from a user gesture. iOS only lets a page speak once it has spoken
 * from inside one, so the first gesture says nothing, silently.
 */
export function unlockVoice(): void {
  if (unlocked) return
  const synth = getSynth()
  if (!synth) return
  unlocked = true
  if (current) return
  try {
    const silent = new SpeechSynthesisUtterance(' ')
    silent.volume = 0
    synth.speak(silent)
  } catch {
    // Speech stays locked; lines are skipped until a gesture unlocks it
  }
}
