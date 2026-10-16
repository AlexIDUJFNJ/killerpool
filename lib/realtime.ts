/**
 * Realtime utilities for Killerpool
 *
 * Spectators follow a shared game through Supabase Realtime. Only spectators:
 * the host is the one writer of its game (every state goes out through
 * lib/sync.ts as a full-row upsert), and has nothing to learn from its own row.
 */

import { createClient } from '@/lib/supabase/client'
import { Game } from './types'
import { RealtimeChannel } from '@supabase/supabase-js'
import { DbGameRow, mapDbGameToGame } from './game-mapper'

let subscriptionCount = 0

/**
 * Subscribe to every update of one game row.
 *
 * Each subscription gets a topic of its own. realtime-js hands back the
 * channel it already has when asked for a topic twice (RealtimeClient.channel),
 * and removeChannel is asynchronous — so subscribing to the same game again
 * (React StrictMode runs every effect twice in development; a spectator can
 * leave a game and come back) returned the old channel, still joined or half
 * way through leaving. On a joined one .on() throws "cannot add
 * postgres_changes callbacks after subscribe()", on a leaving one subscribe()
 * does nothing, and either way realtime stopped without a word. The topic name
 * means nothing to postgres_changes; the filter picks the row.
 */
export function subscribeToGame(
  gameId: string,
  onUpdate: (game: Game) => void,
  onStatus?: (connected: boolean) => void
): RealtimeChannel | null {
  try {
    const supabase = createClient()
    subscriptionCount += 1

    const channel = supabase
      .channel(`game:${gameId}:${subscriptionCount}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          // The same mapping as a plain select, so a realtime update and a
          // fresh load can never disagree about what a row means
          onUpdate(mapDbGameToGame(payload.new as DbGameRow))
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('[subscribeToGame] Subscription error:', err)
        }
        // Report the real state: having a channel object is not the same as
        // being subscribed
        onStatus?.(status === 'SUBSCRIBED')
        if (status === 'CHANNEL_ERROR') {
          console.error('[subscribeToGame] Channel error for game:', gameId)
        } else if (status === 'TIMED_OUT') {
          console.error('[subscribeToGame] Subscription timed out for game:', gameId)
        }
      })

    return channel
  } catch (error) {
    console.error('[subscribeToGame] Failed to subscribe:', error)
    return null
  }
}

/**
 * Unsubscribe from game updates
 */
export async function unsubscribeFromGame(channel: RealtimeChannel | null): Promise<void> {
  if (!channel) return

  try {
    const supabase = createClient()
    await supabase.removeChannel(channel)
  } catch (error) {
    console.error('Failed to unsubscribe from game:', error)
  }
}
