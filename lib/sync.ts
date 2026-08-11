/**
 * Sync utilities for Killerpool
 *
 * Handles synchronization between localStorage and Supabase
 */

import { createClient } from '@/lib/supabase/client'
import { Game } from './types'
import { mapDbGameToGame, mapGameToDbRow } from './game-mapper'
import {
  loadGameHistory,
  saveGameHistory,
  getDeletedGameIds,
  getGameFromHistory,
  getPendingSyncIds,
  markPendingSync,
  unmarkPendingSync,
  recordSyncFailure,
  isSyncExhausted,
  isSyncBackedOff,
} from './storage'

/**
 * Postgres error codes that will never succeed on a retry: the request is
 * malformed or forbidden, not unlucky. Anything else — network failure, an
 * expired token, a 5xx — is worth trying again, so it stays out of this list.
 */
const PERMANENT_PG_CODES = new Set([
  '42501', // insufficient_privilege — refused by RLS
  '22P02', // invalid_text_representation
  '22007', // invalid_datetime_format
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23514', // check_violation
  '42703', // undefined_column — client is newer than the schema
])

export type UpsertOutcome =
  | { ok: true }
  | { ok: false; permanent: boolean; message: string }

/**
 * The leaderboard reads display_name from here, so a profile has to exist
 * before the first game lands. Written with ignoreDuplicates so a custom name
 * is never overwritten.
 */
async function ensurePlayerProfile(
  supabase: ReturnType<typeof createClient>,
  user: { id: string; email?: string } | null
): Promise<void> {
  if (!user) return

  const { error } = await supabase.from('player_profiles').upsert(
    { user_id: user.id, display_name: user.email?.split('@')[0] || 'Player' },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )

  if (error) {
    console.warn('Failed to ensure player profile:', error.message)
  }
}

/**
 * The only place that writes a row into `games`.
 */
async function upsertGameRow(game: Game): Promise<UpsertOutcome> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await ensurePlayerProfile(supabase, user)

    const { error } = await supabase
      .from('games')
      .upsert(mapGameToDbRow(game, user?.id ?? null), { onConflict: 'id' })

    if (error) {
      const message = `${error.message}${error.details ? ` - ${error.details}` : ''}`
      console.error('Failed to sync game to Supabase:', message, error.code)
      return { ok: false, permanent: PERMANENT_PG_CODES.has(error.code ?? ''), message }
    }

    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error syncing game to Supabase:', message)
    return { ok: false, permanent: false, message }
  }
}

/**
 * Sync a completed game to Supabase
 */
export async function syncGameToSupabase(game: Game): Promise<boolean> {
  if (game.status !== 'completed') {
    console.warn('Only completed games can be synced to Supabase')
    return false
  }

  return (await upsertGameRow(game)).ok
}

/**
 * Sync all games from localStorage to Supabase
 */
export async function syncAllGamesToSupabase(): Promise<{
  success: number
  skipped: number
  failed: number
  total: number
}> {
  const games = loadGameHistory()
  // Only completed games can be shared, so anything else is nothing to do —
  // not a failure. Counting them as failures is why this page always reported
  // "Failed: N" to anyone who had abandoned a game.
  const syncable = games.filter(game => game.status === 'completed')

  let success = 0
  let failed = 0

  for (const game of syncable) {
    // via autoSyncGame so a failure here joins the retry queue like any other
    if (await autoSyncGame(game)) {
      success++
    } else {
      failed++
    }
  }

  return {
    success,
    skipped: games.length - syncable.length,
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
  const result = await upsertGameRow(game)
  if (result.ok) {
    unmarkPendingSync(game.id)
    return true
  }

  markPendingSync(game.id)
  recordSyncFailure(game.id, { permanent: result.permanent })
  return false
}

let retryInFlight = false

/**
 * Retry syncing completed games that previously failed (e.g. finished offline).
 * Called on 'online' / 'visibilitychange' events, see components/pwa-init.tsx.
 * Achievements earned by a late sync are announced through an event, because
 * PWAInit is a sibling of GameProvider and has no access to its state.
 */
export async function retryPendingSyncs(): Promise<void> {
  if (typeof window === 'undefined') return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (retryInFlight) return

  retryInFlight = true
  try {
    const ids = getPendingSyncIds()
    for (const id of ids) {
      if (isSyncExhausted(id)) {
        // Refused outright, or tried long enough. Leaving it queued would mean
        // a request on every tab switch, forever, that can never succeed.
        console.warn('[sync] giving up on game after repeated failures:', id)
        unmarkPendingSync(id)
        continue
      }
      if (isSyncBackedOff(id)) continue

      const game = getGameFromHistory(id)
      if (!game) {
        // Game was deleted from history — nothing left to sync
        unmarkPendingSync(id)
        continue
      }

      const result = await upsertGameRow(game)
      if (result.ok) {
        unmarkPendingSync(id)
        const { checkAchievementsForGame, emitUnlockedAchievements } = await import('./achievements')
        emitUnlockedAchievements(await checkAchievementsForGame(game))
      } else {
        recordSyncFailure(id, { permanent: result.permanent })
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
  const result = await upsertGameRow(game)
  return result.ok ? { success: true } : { success: false, error: result.message }
}
