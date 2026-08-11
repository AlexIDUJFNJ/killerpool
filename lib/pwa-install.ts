/**
 * Install-prompt store for Killerpool
 *
 * `beforeinstallprompt` fires once, early, and only if the browser decides the
 * app is installable. Calling preventDefault() on it suppresses the browser's
 * own prompt, so whoever does that owes the user a button — otherwise the app
 * simply cannot be installed that way. This keeps the event outside React
 * (it can arrive before anything is mounted) and exposes it as a snapshot.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

/**
 * `ios` means installable, but only by hand through the share sheet — Safari
 * has no beforeinstallprompt.
 */
export type InstallState = 'unavailable' | 'available' | 'ios' | 'installed'

let deferredPrompt: BeforeInstallPromptEvent | null = null
let state: InstallState = 'unavailable'
let initialized = false
const listeners = new Set<() => void>()

function emit(next: InstallState): void {
  if (next === state) return
  state = next
  listeners.forEach(listener => listener())
}

/** True when the app is already running as an installed PWA */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as Macintosh, so touch points are the giveaway
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/**
 * Start listening. Safe to call more than once; only the first call binds.
 */
export function initInstallCapture(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  if (isStandalone()) {
    emit('installed')
    return
  }

  if (isIOS()) {
    emit('ios')
  }

  window.addEventListener('beforeinstallprompt', event => {
    // Suppress the browser's mini-infobar in favour of our own button
    event.preventDefault()
    deferredPrompt = event
    emit('available')
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit('installed')
  })

  // Some browsers install without firing 'appinstalled'
  window
    .matchMedia('(display-mode: standalone)')
    .addEventListener('change', event => {
      if (event.matches) emit('installed')
    })
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSnapshot(): InstallState {
  return state
}

export function getServerSnapshot(): InstallState {
  return 'unavailable'
}

/**
 * Show the browser's install dialog. The saved event is single-use; Chrome
 * sends a fresh one on a later navigation if the user declines.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'

  const event = deferredPrompt
  deferredPrompt = null
  emit('unavailable')

  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome
}
