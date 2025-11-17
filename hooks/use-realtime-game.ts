/**
 * React hook for realtime game synchronization
 */

import { useEffect, useRef, useState } from 'react'
import { Game, GameHistoryEntry } from '@/lib/types'
import {
  subscribeToGame,
  unsubscribeFromGame,
  isRealtimeAvailable,
  syncGameForRealtime,
} from '@/lib/realtime'
import { RealtimeChannel } from '@supabase/supabase-js'

interface UseRealtimeGameOptions {
  enabled?: boolean
  onGameUpdate?: (game: Partial<Game>) => void
  onNewAction?: (action: GameHistoryEntry) => void
}

export function useRealtimeGame(
  gameId: string | null,
  options: UseRealtimeGameOptions = {}
) {
  const {
    enabled = true,
    onGameUpdate,
    onNewAction,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isAvailable, setIsAvailable] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    // Check if realtime is available
    isRealtimeAvailable().then(setIsAvailable)
  }, [])

  useEffect(() => {
    if (!gameId || !enabled || !isAvailable) {
      return
    }

    console.log('Setting up realtime subscription for game:', gameId)

    const channel = subscribeToGame(
      gameId,
      (gameUpdate) => {
        console.log('Received game update:', gameUpdate)
        onGameUpdate?.(gameUpdate)
      },
      (action) => {
        console.log('Received new action:', action)
        onNewAction?.(action)
      }
    )

    if (channel) {
      channelRef.current = channel
      setIsConnected(true)
    }

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        console.log('Cleaning up realtime subscription')
        unsubscribeFromGame(channelRef.current)
        channelRef.current = null
        setIsConnected(false)
      }
    }
  }, [gameId, enabled, isAvailable, onGameUpdate, onNewAction])

  return {
    isConnected,
    isAvailable,
    channel: channelRef.current,
  }
}

/**
 * Hook to sync a game for realtime when it's created
 */
export function useSyncGameForRealtime(game: Game | null) {
  const [isSynced, setIsSynced] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const syncGame = async () => {
    if (!game || isSynced || isLoading) return

    setIsLoading(true)

    try {
      const success = await syncGameForRealtime(game)
      setIsSynced(success)
    } catch (error) {
      console.error('Failed to sync game:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (game && game.status === 'active' && !isSynced) {
      syncGame()
    }
  }, [game?.id, game?.status])

  return {
    isSynced,
    isLoading,
    syncGame,
  }
}
