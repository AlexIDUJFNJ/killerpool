/**
 * React hook for following a game live
 */

import { useEffect, useRef } from 'react'
import { Game } from '@/lib/types'
import { subscribeToGame, unsubscribeFromGame } from '@/lib/realtime'

interface UseRealtimeGameOptions {
  onGameUpdate: (game: Game) => void
  /** true once the channel is subscribed, false whenever it is not */
  onStatus?: (connected: boolean) => void
}

/**
 * Follow the row of a game somebody else is hosting. Pass null to stop.
 *
 * The subscription belongs to the effect: it is opened and closed with it, so
 * StrictMode's double run and a change of game each get a channel of their own.
 */
export function useRealtimeGame(gameId: string | null, options: UseRealtimeGameOptions): void {
  // Refs, so a new callback identity does not tear down the subscription
  const onGameUpdateRef = useRef(options.onGameUpdate)
  const onStatusRef = useRef(options.onStatus)

  useEffect(() => {
    onGameUpdateRef.current = options.onGameUpdate
    onStatusRef.current = options.onStatus
  })

  useEffect(() => {
    if (!gameId) return

    // A channel being removed can still deliver; nothing it says applies any
    // more once its effect has been cleaned up
    let active = true
    const channel = subscribeToGame(
      gameId,
      (game) => {
        if (active) onGameUpdateRef.current(game)
      },
      (connected) => {
        if (active) onStatusRef.current?.(connected)
      }
    )

    return () => {
      active = false
      void unsubscribeFromGame(channel)
    }
  }, [gameId])
}
