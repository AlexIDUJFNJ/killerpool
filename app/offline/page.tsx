'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'

// Module-level so useSyncExternalStore does not resubscribe on every render
function subscribeToConnectivity(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)
  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

const getIsOnline = () => navigator.onLine
// The service worker serves this page as the offline fallback, so assume
// offline until the client says otherwise — the opposite default would flash
// "connection restored" at someone who genuinely has no network
const getIsOnlineServer = () => false

export default function OfflinePage() {
  const router = useRouter()
  const isOnline = useSyncExternalStore(
    subscribeToConnectivity,
    getIsOnline,
    getIsOnlineServer
  )

  // Redirect on the state, not on the event: opening this page while already
  // online used to promise a redirect and then never perform one
  useEffect(() => {
    if (!isOnline) return
    const timer = setTimeout(() => router.push('/'), 1000)
    return () => clearTimeout(timer)
  }, [isOnline, router])

  const handleRetry = () => {
    if (navigator.onLine) {
      router.push('/')
    } else {
      // Still offline: reloading asks the service worker again
      window.location.reload()
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
            <div className="relative bg-muted/50 backdrop-blur-xl p-8 rounded-full border border-red-500/20">
              <WifiOff className="w-16 h-16 text-red-500" />
            </div>
          </div>
        </div>

        {/* Title & Message — announced when the connection comes back */}
        <div className="space-y-4" role="status" aria-live="polite">
          <h1 className="text-3xl font-bold">
            {isOnline ? 'Connection restored' : 'You are offline'}
          </h1>
          <p className="text-muted-foreground text-lg">
            {isOnline
              ? 'Taking you back to the home screen…'
              : 'Check your internet connection and try again.'}
          </p>
        </div>

        {/* Status indicator */}
        {isOnline && (
          <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
            <div className="w-2 h-2 bg-emerald-500 rounded-full motion-safe:animate-pulse" />
            <span className="text-sm font-medium">Online</span>
          </div>
        )}

        {/* Retry button */}
        {!isOnline && (
          <button
            type="button"
            onClick={handleRetry}
            className="group relative w-full bg-linear-to-r from-emerald-600 to-emerald-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/50 motion-safe:hover:scale-105 motion-safe:active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center justify-center gap-3">
              <RefreshCw className="w-5 h-5" />
              Try again
            </span>
          </button>
        )}

        {/* Offline features notice */}
        <div className="bg-muted/30 backdrop-blur-xs border border-border rounded-xl p-6 space-y-3">
          <h2 className="font-semibold">Offline mode</h2>
          <p className="text-muted-foreground text-sm">
            You can keep playing on this device. Finished games are saved here
            and upload automatically once you are back online.
          </p>
        </div>

        {/* Navigation */}
        <div className="pt-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors text-sm font-medium"
          >
            Back to home
          </button>
        </div>
      </div>
    </main>
  )
}
