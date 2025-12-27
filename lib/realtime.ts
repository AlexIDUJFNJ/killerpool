/**
 * Realtime utilities for Killerpool
 *
 * Handles real-time synchronization of games using Supabase Realtime
 */

import { createClient } from '@/lib/supabase/client'
import { Game, GameHistoryEntry } from './types'
import { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Subscribe to realtime updates for a game
 */
export function subscribeToGame(
  gameId: string,
  onUpdate: (game: Partial<Game>) => void,
  onAction: (action: GameHistoryEntry) => void
): RealtimeChannel | null {
  try {
    console.log('[subscribeToGame] Creating subscription for game:', gameId)
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
          console.log('[subscribeToGame] Received UPDATE event:', payload)

          const newData = payload.new as any

          // Convert database format to Game format
          const gameUpdate: Partial<Game> = {
            id: newData.id,
            updatedAt: newData.updated_at,
            status: newData.status,
            players: newData.participants,
            winnerId: newData.winner_id,
            history: newData.history,
          }

          console.log('[subscribeToGame] Calling onUpdate with:', gameUpdate)
          onUpdate(gameUpdate)

          // If history changed, notify about new action
          if (newData.history && Array.isArray(newData.history)) {
            const lastAction = newData.history[newData.history.length - 1]
            if (lastAction) {
              onAction(lastAction)
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[subscribeToGame] Subscription status:', status)
        if (err) {
          console.error('[subscribeToGame] Subscription error:', err)
        }
        if (status === 'SUBSCRIBED') {
          console.log('[subscribeToGame] Successfully subscribed to game:', gameId)
        } else if (status === 'CHANNEL_ERROR') {
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
    console.log('Unsubscribed from game')
  } catch (error) {
    console.error('Failed to unsubscribe from game:', error)
  }
}

/**
 * Broadcast a game action to all connected clients
 */
export async function broadcastGameAction(
  gameId: string,
  action: GameHistoryEntry
): Promise<boolean> {
  try {
    const supabase = createClient()

    // Get current game data
    const { data: game, error } = await supabase
      .from('games')
      .select('history, participants')
      .eq('id', gameId)
      .single()

    if (error) {
      console.error('Failed to fetch game:', error)
      return false
    }

    // Add new action to history
    const updatedHistory = [...(game.history || []), action]

    // Update participants if lives changed
    const updatedParticipants = (game.participants as any[]).map((p: any) => {
      if (p.id === action.playerId) {
        return {
          ...p,
          lives: action.livesAfter,
          eliminated: action.livesAfter <= 0,
        }
      }
      return p
    })

    // Update game in database
    const { error: updateError } = await supabase
      .from('games')
      .update({
        history: updatedHistory,
        participants: updatedParticipants,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)

    if (updateError) {
      console.error('Failed to update game:', updateError)
      return false
    }

    console.log('Game action broadcasted successfully')
    return true
  } catch (error) {
    console.error('Failed to broadcast game action:', error)
    return false
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

    const updateData: any = {
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

    console.log('Game status updated successfully')
    return true
  } catch (error) {
    console.error('Failed to update game status:', error)
    return false
  }
}

/**
 * Check if realtime is available
 * Realtime is always available - authentication is not required for spectators
 */
export async function isRealtimeAvailable(): Promise<boolean> {
  return true
}

/**
 * Sync local game to Supabase for realtime
 * Works for both authenticated users and guests
 */
export async function syncGameForRealtime(game: Game): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Note: We now allow guests to sync games for sharing
    // The game will be accessible to spectators via the share link

    // Validate ruleset_id - only use if it's a valid UUID
    const isValidUUID = game.rulesetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(game.rulesetId)

    const gameData = {
      id: game.id,
      created_at: game.createdAt,
      updated_at: game.updatedAt || new Date().toISOString(),
      status: game.status,
      participants: game.players,
      winner_id: game.winnerId || null,
      ruleset_id: isValidUUID ? game.rulesetId : null,
      history: game.history,
      created_by: user?.id || null,
    }

    const { error } = await supabase
      .from('games')
      .upsert(gameData, {
        onConflict: 'id',
      })

    if (error) {
      console.error('Failed to sync game for realtime:', error)
      return false
    }

    console.log('Game synced for realtime successfully')
    return true
  } catch (error) {
    console.error('Failed to sync game for realtime:', error)
    return false
  }
}
