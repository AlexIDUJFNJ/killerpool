/**
 * Realtime utilities for Killerpool
 *
 * Handles real-time synchronization of games using Supabase Realtime
 */

import { createClient } from '@/lib/supabase/client'
import { Game, GameHistoryEntry, Player } from './types'
import { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

type GameRow = Database['public']['Tables']['games']['Row']
type GameUpdate = Database['public']['Tables']['games']['Update']
// NOTE: writes during a shared game go through syncActiveGameToSupabase
// (lib/sync.ts), which upserts the full game state owned by the host —
// there is no per-action write path here.

/**
 * Subscribe to realtime updates for a game
 */
export function subscribeToGame(
  gameId: string,
  onUpdate: (game: Partial<Game>) => void,
  onAction: (action: GameHistoryEntry) => void,
  onStatus?: (connected: boolean) => void
): RealtimeChannel | null {
  try {
    const supabase = createClient()

    // Create a channel for this game
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const newData = payload.new as GameRow

          // Convert database format to Game format. participants/history are
          // Json in the schema but hold the client's own shapes.
          const gameUpdate: Partial<Game> = {
            id: newData.id,
            updatedAt: newData.updated_at,
            status: newData.status,
            players: newData.participants as unknown as Player[],
            winnerId: newData.winner_id,
            history: (newData.history ?? []) as unknown as GameHistoryEntry[],
            currentPlayerIndex: newData.current_player_index ?? 0,
          }

          onUpdate(gameUpdate)

          // If history changed, notify about new action
          const history = gameUpdate.history ?? []
          const lastAction = history[history.length - 1]
          if (lastAction) {
            onAction(lastAction)
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('[subscribeToGame] Subscription error:', err)
        }
        // Report the real state: having a channel object is not the same as
        // being subscribed, and the "live" indicator used to claim otherwise
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

/**
 * Update game status in realtime
 */
export async function updateGameStatus(
  gameId: string,
  status: 'active' | 'completed' | 'abandoned',
  winnerId?: string | null
): Promise<boolean> {
  try {
    const supabase = createClient()

    const updateData: GameUpdate = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (winnerId !== undefined) {
      updateData.winner_id = winnerId
    }

    const { error } = await supabase
      .from('games')
      .update(updateData)
      .eq('id', gameId)

    if (error) {
      console.error('Failed to update game status:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to update game status:', error)
    return false
  }
}
