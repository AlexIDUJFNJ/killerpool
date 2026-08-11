/**
 * React hook for realtime game synchronization
 */

import { useEffect, useRef, useState } from 'react'
import { Game, GameHistoryEntry } from '@/lib/types'
import { subscribeToGame, unsubscribeFromGame } from '@/lib/realtime'
import { syncActiveGameToSupabase } from '@/lib/sync'
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
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Use refs for callbacks to avoid re-subscribing on every render
  const onGameUpdateRef = useRef(onGameUpdate)
  const onNewActionRef = useRef(onNewAction)

  // Keep refs up to date
  useEffect(() => {
    onGameUpdateRef.current = onGameUpdate
    onNewActionRef.current = onNewAction
  }, [onGameUpdate, onNewAction])

  useEffect(() => {
    if (!gameId || !enabled) {
      return
    }

    // Don't re-subscribe if we already have a channel for this game
    if (channelRef.current) {
      return
    }


    const channel = subscribeToGame(
      gameId,
      (gameUpdate) => {
        onGameUpdateRef.current?.(gameUpdate)
      },
      (action) => {
        onNewActionRef.current?.(action)
      },
      // Driven by the channel's own status, so "live" means subscribed rather
      // than merely "a channel object exists"
      setIsConnected
    )

    if (channel) {
      channelRef.current = channel
    }

    // Cleanup on unmount or when gameId/enabled changes
    return () => {
      if (channelRef.current) {
        unsubscribeFromGame(channelRef.current)
        channelRef.current = null
        setIsConnected(false)
      }
    }
  }, [gameId, enabled]) // Removed callback dependencies

  return {
    isConnected,
  }
}

/**
 * Hook to sync a game for realtime when it's created
 */
export function useSyncGameForRealtime(game: Game | null) {
  // Keyed by game id rather than a plain boolean: a second shared game in the
  // same session used to be left unsynced, because the flag never reset
  const [syncedGameId, setSyncedGameId] = useState<string | null>(null)
  const inFlightRef = useRef(false)

  const isSynced = syncedGameId !== null && syncedGameId === (game?.id ?? null)

  useEffect(() => {
    if (!game || game.status !== 'active' || isSynced || inFlightRef.current) return

    inFlightRef.current = true

    syncActiveGameToSupabase(game)
      .then(({ success }) => {
        if (success) setSyncedGameId(game.id)
      })
      .catch((error) => {
        console.error('Failed to sync game:', error)
      })
      .finally(() => {
        inFlightRef.current = false
      })
  }, [game, isSynced])

  return {
    isSynced,
  }
}
