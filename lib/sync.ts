/**
 * Sync utilities for Killerpool
 *
 * Handles synchronization between localStorage and Supabase
 */

import { createClient } from '@/lib/supabase/client'
import { Game } from './types'
import { mapDbGameToGame } from './game-mapper'
import {
  loadGameHistory,
  saveGameHistory,
  getDeletedGameIds,
  getGameFromHistory,
  getPendingSyncIds,
  markPendingSync,
  unmarkPendingSync,
} from './storage'

/**
 * Sync a completed game to Supabase
 */
export async function syncGameToSupabase(game: Game): Promise<boolean> {
  if (game.status !== 'completed') {
    console.warn('Only completed games can be synced to Supabase')
    return false
  }

  try {
    const supabase = createClient()

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()

    // Ensure user profile exists before syncing game
    // Only create profile with default name if it doesn't exist - don't overwrite custom names
    if (user) {
      const { data: existingProfile } = await supabase
        .from('player_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!existingProfile) {
        const defaultName = user.email?.split('@')[0] || 'Player'
        await supabase
          .from('player_profiles')
          .insert({
            user_id: user.id,
            display_name: defaultName,
          })
      }
    }

    // Prepare game data for Supabase
    // Note: ruleset_id in database is UUID, but game.rulesetId may be a string like "classic"
    // We only set ruleset_id if it's a valid UUID format, otherwise set to null
    const isValidUUID = game.rulesetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(game.rulesetId)

    const gameData = {
      id: game.id,
      created_at: game.createdAt,
      updated_at: game.updatedAt,
      status: game.status,
      participants: game.players,
      winner_id: game.winnerId,
      ruleset_id: isValidUUID ? game.rulesetId : null,
      history: game.history,
      created_by: user?.id || null,
    }

    // Insert or update the game
    const { error } = await supabase
      .from('games')
      .upsert(gameData, {
        onConflict: 'id',
      })

    if (error) {
      console.error('Failed to sync game to Supabase:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error syncing game to Supabase:', error)
    return false
  }
}

/**
 * Sync all games from localStorage to Supabase
 */
export async function syncAllGamesToSupabase(): Promise<{
  success: number
  failed: number
  total: number
}> {
  const games = loadGameHistory()
  let success = 0
  let failed = 0

  for (const game of games) {
    const result = await syncGameToSupabase(game)
    if (result) {
      success++
    } else {
      failed++
    }
  }

  return {
    success,
    failed,
    total: games.length,
  }
}

/**
 * Load games from Supabase and merge with localStorage
 */
export async function loadGamesFromSupabase(): Promise<Game[]> {
  try {
    const supabase = createClient()

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return []
    }

    // Fetch user's games from Supabase
    const { data: games, error } = await supabase
      .from('games')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load games from Supabase:', error)
      return []
    }

    // Convert Supabase games to our Game type
    return (games || []).map(mapDbGameToGame)
  } catch (error) {
    console.error('Error loading games from Supabase:', error)
    return []
  }
}

/**
 * Merge Supabase games with localStorage games
 * Removes duplicates and keeps the most recent version
 */
export async function mergeGamesWithSupabase(): Promise<void> {
  try {
    const localGames = loadGameHistory()
    const supabaseGames = await loadGamesFromSupabase()

    // Create a map of games by ID
    const gameMap = new Map<string, Game>()

    // Add local games first
    localGames.forEach(game => {
      gameMap.set(game.id, game)
    })

    // Merge with Supabase games (Supabase takes priority if newer).
    // Games deleted locally stay deleted: their row in Supabase is always
    // "newer" (the updated_at trigger), so without this they would come back
    // on every merge.
    const deleted = getDeletedGameIds()
    supabaseGames
      .filter(game => !deleted.has(game.id))
      .forEach(game => {
        const existingGame = gameMap.get(game.id)
        if (!existingGame || new Date(game.updatedAt) > new Date(existingGame.updatedAt)) {
          gameMap.set(game.id, game)
        }
      })

    // Convert map back to array and sort by date (newest first)
    const mergedGames = Array.from(gameMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Save merged games to localStorage
    saveGameHistory(mergedGames)

  } catch (error) {
    console.error('Error merging games with Supabase:', error)
  }
}

/**
 * Check if Supabase is available and user is authenticated
 */
export async function isSupabaseAvailable(): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return !!user
  } catch {
    return false
  }
}

/**
 * Auto-sync completed game to Supabase (for both authenticated and guest users)
 * Games that fail to sync (e.g. offline) are marked pending and retried later
 * by retryPendingSyncs(). Returns whether the sync succeeded.
 */
export async function autoSyncGame(game: Game): Promise<boolean> {
  if (game.status !== 'completed') {
    return false
  }

  // Always try to sync to Supabase (for sharing game links)
  const success = await syncGameToSupabase(game)
  if (success) {
    unmarkPendingSync(game.id)
  } else {
    markPendingSync(game.id)
  }
  return success
}

let retryInFlight = false

/**
 * Retry syncing completed games that previously failed (e.g. finished offline).
 * Called on 'online' / 'visibilitychange' events, see components/pwa-init.tsx.
 * Achievements for late-synced games are granted here too (without toasts) —
 * the RPC can only see the game once its row exists in Supabase.
 */
export async function retryPendingSyncs(): Promise<void> {
  if (typeof window === 'undefined') return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (retryInFlight) return

  retryInFlight = true
  try {
    const ids = getPendingSyncIds()
    for (const id of ids) {
      const game = getGameFromHistory(id)
      if (!game) {
        // Game was deleted from history — nothing left to sync
        unmarkPendingSync(id)
        continue
      }
      const success = await syncGameToSupabase(game)
      if (success) {
        unmarkPendingSync(id)
        const { checkAchievementsForGame } = await import('./achievements')
        await checkAchievementsForGame(game)
      }
    }
  } finally {
    retryInFlight = false
  }
}

/**
 * Sync an active game to Supabase for sharing/spectator mode
 * Unlike syncGameToSupabase, this works for games of any status
 */
export async function syncActiveGameToSupabase(game: Game): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.warn('[syncActiveGame] Auth check failed (continuing as anonymous):', authError.message)
    }


    // Ensure user profile exists before syncing game
    if (user) {
      const { data: existingProfile } = await supabase
        .from('player_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!existingProfile) {
        const defaultName = user.email?.split('@')[0] || 'Player'
        await supabase
          .from('player_profiles')
          .insert({
            user_id: user.id,
            display_name: defaultName,
          })
      }
    }

    // Prepare game data for Supabase
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
      current_player_index: game.currentPlayerIndex,
    }


    // Insert or update the game
    const { error } = await supabase
      .from('games')
      .upsert(gameData, {
        onConflict: 'id',
      })
      .select()

    if (error) {
      const errorMsg = `${error.message}${error.details ? ` - ${error.details}` : ''}${error.hint ? ` (Hint: ${error.hint})` : ''}`
      console.error('[syncActiveGame] Failed to sync:', errorMsg)
      console.error('[syncActiveGame] Error code:', error.code)
      return { success: false, error: errorMsg }
    }

    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[syncActiveGame] Error:', errorMsg)
    return { success: false, error: errorMsg }
  }
}
