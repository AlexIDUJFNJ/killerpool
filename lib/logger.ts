/**
 * Debug logging for Killerpool
 *
 * Silent in production unless explicitly switched on, because the interesting
 * paths here (offline sync, service worker, realtime) are debugged on a real
 * phone over remote devtools, where the console is the only instrument.
 * Turn it on from the device with:
 *
 *     localStorage.setItem('killerpool_debug', '1')
 *
 * Warnings and errors are not routed through this — they should always surface.
 */

function isEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  try {
    return localStorage.getItem('killerpool_debug') === '1'
  } catch {
    return false
  }
}

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isEnabled()) console.log(...args)
  },
}
