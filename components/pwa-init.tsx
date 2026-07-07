'use client'

import { useEffect } from 'react'
import { retryPendingSyncs } from '@/lib/sync'

/**
 * PWA Initialization Component
 * Handles service worker registration and retrying failed game syncs
 */
export function PWAInit() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

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

    // Handle app install prompt
    let _deferredPrompt: any = null

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      _deferredPrompt = e
      // You can show install button here
      console.log('PWA install prompt ready')
    }

    const handleAppInstalled = () => {
      console.log('PWA installed successfully')
      _deferredPrompt = null
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Register service worker (only where supported)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration)

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available, notify user
                  console.log('New service worker available')
                  // You can show a toast/notification here
                }
              })
            }
          })
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error)
        })
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  return null
}
