'use client'

import { useEffect } from 'react'
import { retryPendingSyncs } from '@/lib/sync'
import { initInstallCapture } from '@/lib/pwa-install'

/**
 * PWA Initialization Component
 * Retries failed game syncs and captures the install prompt (see
 * components/pwa-install-button.tsx for the UI).
 *
 * The service worker is not registered here. @ducanh2912/next-pwa does it
 * (`register: true` in next.config.js) from the script it injects into the
 * client entry, which also drives cacheOnFrontEndNav and reloadOnOnline and
 * stays off in development. A second register('/sw.js') here was redundant in
 * production, and in `next dev` it registered whatever public/sw.js the last
 * build had left behind.
 */
export function PWAInit() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    initInstallCapture()

    // Retry syncing games that were completed offline.
    // Independent of service worker support — needs only localStorage + fetch.
    retryPendingSyncs().catch(console.error)

    const handleOnline = () => {
      retryPendingSyncs().catch(console.error)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        retryPendingSyncs().catch(console.error)
      }
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}
