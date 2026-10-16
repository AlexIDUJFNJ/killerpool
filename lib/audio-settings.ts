/**
 * Sound settings: the effects and the commentator's voice, each on or off.
 *
 * Stored per device in localStorage, both on until someone switches one off.
 * Read as an external store (see hooks/use-audio-settings.ts), so the switch
 * in the header and the code that plays a sound always agree, also across
 * tabs.
 */

export interface AudioSettings {
  /** Shots, knockouts, the final duel and the winner's fanfare */
  sound: boolean
  /** The commentator reading their lines aloud */
  voice: boolean
}

export type AudioSettingKey = keyof AudioSettings

export const AUDIO_SETTINGS_STORAGE_KEY = 'killerpool-audio'
export const AUDIO_SETTINGS_CHANGE_EVENT = 'killerpool-audio-change'

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = Object.freeze({ sound: true, voice: true })

// The latest choice, while localStorage will not take it (blocked storage,
// some private modes, a full quota), so it still sticks for the rest of the
// visit
let memorySettings: AudioSettings | null = null

// useSyncExternalStore wants the same object back while nothing has changed
let cachedRaw: string | null = null
let cachedSettings: AudioSettings = DEFAULT_AUDIO_SETTINGS

function parse(raw: string): AudioSettings {
  try {
    const value: unknown = JSON.parse(raw)
    const stored = typeof value === 'object' && value !== null ? (value as Partial<AudioSettings>) : {}
    return {
      sound: typeof stored.sound === 'boolean' ? stored.sound : DEFAULT_AUDIO_SETTINGS.sound,
      voice: typeof stored.voice === 'boolean' ? stored.voice : DEFAULT_AUDIO_SETTINGS.voice,
    }
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
}

export function readAudioSettings(): AudioSettings {
  if (memorySettings) return memorySettings
  let raw: string | null
  try {
    raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY)
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
  if (raw === null) return DEFAULT_AUDIO_SETTINGS
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSettings = parse(raw)
  }
  return cachedSettings
}

export function setAudioSetting(key: AudioSettingKey, value: boolean): void {
  const next: AudioSettings = { ...readAudioSettings(), [key]: value }
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(next))
    memorySettings = null
  } catch {
    memorySettings = next
  }
  window.dispatchEvent(new Event(AUDIO_SETTINGS_CHANGE_EVENT))
}

/** Calls back on a change made here or in another tab */
export function subscribeToAudioSettings(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === AUDIO_SETTINGS_STORAGE_KEY) onChange()
  }
  window.addEventListener(AUDIO_SETTINGS_CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(AUDIO_SETTINGS_CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}
