'use client'

import { useEffect } from 'react'
import { setupSyncListeners, syncNow } from '@/lib/sync-manager'

/**
 * PWA Initialization Component
 * Handles service worker registration and background sync setup
 */
export function PWAInit() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    // Setup sync listeners
    setupSyncListeners()

    // Register service worker
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration)

        // Try to sync pending items on registration
        syncNow().catch(console.error)

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

    // Handle app install prompt
    let deferredPrompt: any = null

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e
      // You can show install button here
      console.log('PWA install prompt ready')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Handle successful install
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed successfully')
      deferredPrompt = null
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  return null
}
