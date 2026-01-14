'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function OfflinePage() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setTimeout(() => {
        router.push('/')
      }, 1000)
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    // Check initial state
    setIsOnline(navigator.onLine)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [router])

  const handleRetry = () => {
    if (navigator.onLine) {
      router.push('/')
    } else {
      // Try to reload
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
            <div className="relative bg-gray-800/50 backdrop-blur-xl p-8 rounded-full border border-red-500/20">
              <WifiOff className="w-16 h-16 text-red-500" />
            </div>
          </div>
        </div>

        {/* Title & Message */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-white">
            {isOnline ? 'Подключение восстановлено!' : 'Нет подключения'}
          </h1>
          <p className="text-gray-400 text-lg">
            {isOnline
              ? 'Перенаправление на главную...'
              : 'Проверьте подключение к интернету и попробуйте снова'}
          </p>
        </div>

        {/* Status indicator */}
        {isOnline && (
          <div className="flex items-center justify-center gap-2 text-emerald-500">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">Онлайн</span>
          </div>
        )}

        {/* Retry button */}
        {!isOnline && (
          <button
            onClick={handleRetry}
            className="group relative w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/50 hover:scale-105 active:scale-95"
          >
            <span className="flex items-center justify-center gap-3">
              <RefreshCw className="w-5 h-5" />
              Повторить попытку
            </span>
          </button>
        )}

        {/* Offline features notice */}
        <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 space-y-3">
          <h3 className="text-white font-semibold">Офлайн режим</h3>
          <p className="text-gray-400 text-sm">
            Вы можете продолжить играть в локальном режиме. Игры будут синхронизированы
            автоматически при восстановлении подключения.
          </p>
        </div>

        {/* Navigation */}
        <div className="pt-4">
          <button
            onClick={() => router.push('/')}
            className="text-emerald-500 hover:text-emerald-400 transition-colors text-sm font-medium"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    </div>
  )
}
