/**
 * Sync utilities for Killerpool
 *
 * Handles synchronization between localStorage and Supabase
 */

import { createClient } from '@/lib/supabase/client'
import { Game } from './types'
import { loadGameHistory } from './storage'

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

    console.log('Game successfully synced to Supabase:', game.id)
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
      console.log('User not authenticated, skipping Supabase sync')
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
    const convertedGames: Game[] = (games || []).map((game: any) => ({
      id: game.id,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
      status: game.status,
      players: game.participants,
      currentPlayerIndex: 0, // This is only relevant for active games
      winnerId: game.winner_id,
      rulesetId: game.ruleset_id,
      ruleset: {
        id: 'classic',
        name: 'Classic Killer Pool',
        params: {
          starting_lives: 3,
          miss: -1,
          pot: 0,
          pot_black: 1,
          max_lives: 6,
        },
        is_default: true,
      },
      history: game.history,
      createdBy: game.created_by,
    }))

    return convertedGames
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

    // Merge with Supabase games (Supabase takes priority if newer)
    supabaseGames.forEach(game => {
      const existingGame = gameMap.get(game.id)
      if (!existingGame || new Date(game.updatedAt) > new Date(existingGame.updatedAt)) {
        gameMap.set(game.id, game)
      }
    })

    // Convert map back to array and sort by date (newest first)
    const mergedGames = Array.from(gameMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50) // Keep only last 50 games

    // Save merged games to localStorage
    localStorage.setItem('killerpool_game_history', JSON.stringify(mergedGames))

    console.log('Games successfully merged with Supabase')
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
 */
export async function autoSyncGame(game: Game): Promise<void> {
  if (game.status !== 'completed') {
    return
  }

  // Always try to sync to Supabase (for sharing game links)
  await syncGameToSupabase(game)
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

    console.log('[syncActiveGame] Starting sync for game:', game.id)
    console.log('[syncActiveGame] User:', user?.id || 'anonymous')
    console.log('[syncActiveGame] Game status:', game.status)
    console.log('[syncActiveGame] Players count:', game.players?.length || 0)

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

    console.log('[syncActiveGame] Upserting game data:', JSON.stringify(gameData, null, 2))

    // Insert or update the game
    const { data, error } = await supabase
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

    console.log('[syncActiveGame] Success! Synced game:', data)
    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[syncActiveGame] Error:', errorMsg)
    return { success: false, error: errorMsg }
  }
}
