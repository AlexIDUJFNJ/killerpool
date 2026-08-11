'use client'

import { useEffect } from 'react'
import { retryPendingSyncs } from '@/lib/sync'
import { initInstallCapture } from '@/lib/pwa-install'

/**
 * PWA Initialization Component
 * Registers the service worker, retries failed game syncs and captures the
 * install prompt (see components/pwa-install-button.tsx for the UI)
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

    // Register service worker (only where supported)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service Worker registration failed:', error)
      })
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}
