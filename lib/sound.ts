/**
 * Sound effects for the game screen, synthesised with the Web Audio API.
 *
 * No audio files and no dependencies: every effect is a handful of
 * oscillators and bursts of filtered noise, scheduled on one shared
 * AudioContext. They are kept short and soft on purpose — a pot or a miss is
 * heard a hundred times in an evening — and pass through one compressor, so
 * effects that overlap never clip.
 *
 * The context is created lazily, on the first gesture (unlockSound) or the
 * first effect, never on import. Browsers start it suspended until the page
 * has been touched, and iOS keeps it silent until it is resumed from inside a
 * gesture handler. Where there is no Web Audio at all, every function here
 * quietly does nothing.
 */

export type SoundEffect = 'pot' | 'miss' | 'black' | 'eliminated' | 'duel' | 'victory'

type AudioContextConstructor = new () => AudioContext

/** Overall level, before the compressor. The effects are mixed against it. */
const MASTER_VOLUME = 0.5

/**
 * How long an effect asked for while the context was suspended may wait for
 * it to resume. Anything later would come out of nowhere: a spectator who
 * never touched the page would hear every shot so far at once on their first
 * tap.
 */
const RESUME_GRACE_MS = 300

let context: AudioContext | null = null
let master: AudioNode | null = null
let noiseBuffer: AudioBuffer | null = null
let primed = false

function audioContextClass(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    AudioContext?: AudioContextConstructor
    // Safari before 14.1
    webkitAudioContext?: AudioContextConstructor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** Whether this browser can play the effects at all */
export function isSoundSupported(): boolean {
  return audioContextClass() !== null
}

/** The shared context, created on first use; null where there is no Web Audio */
function getContext(): AudioContext | null {
  if (context) return context
  const AudioContextClass = audioContextClass()
  if (!AudioContextClass) return null

  try {
    const created = new AudioContextClass()
    const gain = created.createGain()
    gain.gain.value = MASTER_VOLUME
    const compressor = created.createDynamicsCompressor()
    gain.connect(compressor)
    compressor.connect(created.destination)
    context = created
    master = gain
  } catch {
    // Some browsers cap the number of contexts, or refuse one outright
    return null
  }
  return context
}

/**
 * Call from a user gesture. Creates the context if needed, resumes it, and
 * plays one silent sample — what iOS needs before it lets Web Audio make a
 * sound. Cheap to call on every tap: a running context is left alone.
 */
export function unlockSound(): void {
  const ctx = getContext()
  if (!ctx) return

  try {
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {})
    }
    if (!primed) {
      primed = true
      const source = ctx.createBufferSource()
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      source.connect(ctx.destination)
      source.start(0)
    }
  } catch {
    // Nothing to unlock with; the effects stay silent
  }
}

/** Play one effect. Never throws, and does nothing without Web Audio. */
export function playSound(effect: SoundEffect): void {
  const ctx = getContext()
  if (!ctx) return

  const schedule = () => {
    try {
      if (master) EFFECTS[effect](ctx, master, ctx.currentTime + 0.02)
    } catch {
      // A sound is never worth an error
    }
  }

  if (ctx.state === 'running') {
    schedule()
    return
  }

  // Suspended (no gesture yet) or, on iOS, interrupted by a call or by the
  // app going to the background. Ask to resume and play only if that is quick.
  const askedAt = Date.now()
  try {
    ctx
      .resume()
      .then(() => {
        if (Date.now() - askedAt <= RESUME_GRACE_MS) schedule()
      })
      .catch(() => {})
  } catch {
    // Resuming is not allowed here; stay silent
  }
}

// ---------------------------------------------------------------------------
// Synthesis

interface ToneOptions {
  type?: OscillatorType
  freq: number
  /** Glide to this frequency over the tone's length */
  to?: number
  at: number
  attack?: number
  /** Time at full level after the attack, before the decay */
  hold?: number
  length: number
  peak: number
  lowpass?: number
  vibrato?: { rate: number; depth: number }
}

interface NoiseOptions {
  at: number
  length: number
  peak: number
  filter: BiquadFilterType
  freq: number
  q?: number
}

/** A gain node shaped attack → hold → exponential decay to silence */
function envelope(ctx: AudioContext, at: number, attack: number, hold: number, length: number, peak: number): GainNode {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + attack)
  if (hold > 0) gain.gain.setValueAtTime(peak, at + attack + hold)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  return gain
}

function tone(ctx: AudioContext, out: AudioNode, options: ToneOptions): void {
  const { at, length } = options
  const osc = ctx.createOscillator()
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(options.freq, at)
  if (options.to) osc.frequency.exponentialRampToValueAtTime(options.to, at + length)

  let source: AudioNode = osc
  if (options.lowpass) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(options.lowpass, at)
    osc.connect(filter)
    source = filter
  }

  const gain = envelope(ctx, at, options.attack ?? 0.005, options.hold ?? 0, length, options.peak)
  source.connect(gain)
  gain.connect(out)

  if (options.vibrato) {
    const lfo = ctx.createOscillator()
    lfo.frequency.setValueAtTime(options.vibrato.rate, at)
    const depth = ctx.createGain()
    depth.gain.setValueAtTime(options.vibrato.depth, at)
    lfo.connect(depth)
    depth.connect(osc.frequency)
    lfo.start(at)
    lfo.stop(at + length + 0.05)
  }

  osc.start(at)
  osc.stop(at + length + 0.05)
}

/** One second of white noise, made once and reused by every burst */
function getNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const length = Math.floor(ctx.sampleRate)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

function noise(ctx: AudioContext, out: AudioNode, options: NoiseOptions): void {
  const { at, length } = options
  const source = ctx.createBufferSource()
  source.buffer = getNoise(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = options.filter
  filter.frequency.setValueAtTime(options.freq, at)
  filter.Q.setValueAtTime(options.q ?? 1, at)
  const gain = envelope(ctx, at, 0.002, 0, length, options.peak)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  source.start(at)
  source.stop(at + length + 0.05)
}

/** Two phenolic balls meeting: a bright, very short knock with a faint ring */
function clack(ctx: AudioContext, out: AudioNode, at: number, level = 1): void {
  noise(ctx, out, { at, length: 0.035, peak: 0.5 * level, filter: 'bandpass', freq: 3000, q: 1.2 })
  tone(ctx, out, { freq: 2600, at, length: 0.06, peak: 0.12 * level })
  tone(ctx, out, { freq: 4100, at, length: 0.04, peak: 0.06 * level })
}

/** A brass-like note: sawtooth and square under a lowpass */
function brass(ctx: AudioContext, out: AudioNode, freq: number, at: number, length: number, peak: number): void {
  const hold = length * 0.55
  tone(ctx, out, { type: 'sawtooth', freq, at, attack: 0.02, hold, length, peak, lowpass: 2400 })
  tone(ctx, out, { type: 'square', freq, at, attack: 0.02, hold, length, peak: peak * 0.35, lowpass: 1600 })
}

type Effect = (ctx: AudioContext, out: AudioNode, t: number) => void

// Note frequencies, Hz
const G3 = 196
const FS3 = 185
const F3 = 174.61
const E3 = 164.81
const D3 = 146.83
const A2 = 110
const C4 = 261.63
const E4 = 329.63
const G4 = 392
const B4 = 493.88
const C5 = 523.25
const D5 = 587.33
const E5 = 659.25
const G5 = 783.99

const EFFECTS: Record<SoundEffect, Effect> = {
  // Cue ball meets object ball, then the ball drops into the pocket: ~0.5 s
  pot(ctx, out, t) {
    clack(ctx, out, t)
    tone(ctx, out, { freq: 180, to: 65, at: t + 0.16, attack: 0.004, length: 0.24, peak: 0.45 })
    noise(ctx, out, { at: t + 0.17, length: 0.22, peak: 0.12, filter: 'lowpass', freq: 500 })
  },

  // A dull thump off the cushion and a soft two-note "nope": ~0.45 s
  miss(ctx, out, t) {
    noise(ctx, out, { at: t, length: 0.12, peak: 0.25, filter: 'lowpass', freq: 350 })
    tone(ctx, out, { type: 'triangle', freq: G3, at: t + 0.02, attack: 0.01, length: 0.16, peak: 0.18, lowpass: 900 })
    tone(ctx, out, { type: 'triangle', freq: D3, at: t + 0.16, attack: 0.01, length: 0.3, peak: 0.18, lowpass: 700 })
  },

  // The black drops: the clack, a low gong and a G major chord blooming
  // upwards: ~1.4 s
  black(ctx, out, t) {
    clack(ctx, out, t)
    tone(ctx, out, { freq: 98, at: t + 0.05, attack: 0.01, length: 1.4, peak: 0.22 })
    tone(ctx, out, { freq: G3, at: t + 0.05, attack: 0.01, length: 1, peak: 0.08 })
    ;[G4, B4, D5, G5].forEach((freq, i) => {
      tone(ctx, out, { type: 'triangle', freq, at: t + 0.08 + i * 0.07, attack: 0.02, length: 1.2 - i * 0.1, peak: 0.1 })
    })
  },

  // A muted sad trombone, three steps down and a wobbling last note: ~1.45 s
  eliminated(ctx, out, t) {
    ;[G3, FS3, F3].forEach((freq, i) => {
      tone(ctx, out, { type: 'sawtooth', freq, at: t + i * 0.26, attack: 0.02, hold: 0.16, length: 0.3, peak: 0.13, lowpass: 1100 })
    })
    tone(ctx, out, {
      type: 'sawtooth',
      freq: E3,
      at: t + 0.78,
      attack: 0.02,
      hold: 0.35,
      length: 0.65,
      peak: 0.14,
      lowpass: 1100,
      vibrato: { rate: 6, depth: 4 },
    })
  },

  // Two timpani hits under a dark A minor swell: ~1.5 s
  duel(ctx, out, t) {
    tone(ctx, out, { freq: A2, to: 52, at: t, attack: 0.004, length: 0.5, peak: 0.55 })
    noise(ctx, out, { at: t, length: 0.15, peak: 0.2, filter: 'lowpass', freq: 200 })
    tone(ctx, out, { freq: 98, to: 48, at: t + 0.28, attack: 0.004, length: 0.6, peak: 0.5 })
    ;[A2, E3, C4].forEach((freq) => {
      tone(ctx, out, { type: 'sawtooth', freq, at: t + 0.1, attack: 0.45, hold: 0.45, length: 1.4, peak: 0.06, lowpass: 800 })
    })
  },

  // Ta-ta-ta-taaa, ta-taaaa over a C major chord and a little shimmer: ~2.3 s
  victory(ctx, out, t) {
    const notes: Array<[number, number, number]> = [
      [G4, 0, 0.12],
      [C5, 0.13, 0.12],
      [E5, 0.26, 0.12],
      [G5, 0.39, 0.32],
      [E5, 0.74, 0.14],
      [G5, 0.9, 1.3],
    ]
    notes.forEach(([freq, offset, length]) => brass(ctx, out, freq, t + offset, length, 0.09))
    ;[C4, E4, G4].forEach((freq) => {
      tone(ctx, out, { type: 'triangle', freq, at: t + 0.9, attack: 0.1, hold: 0.6, length: 1.35, peak: 0.07 })
    })
    noise(ctx, out, { at: t + 0.9, length: 0.9, peak: 0.05, filter: 'highpass', freq: 6000 })
  },
}
