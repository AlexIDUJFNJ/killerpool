/**
 * Sync utilities for Killerpool
 *
 * Handles synchronization between localStorage and Supabase
 */

import { isAuthSessionMissingError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { Game } from './types'
import { mapDbGameToGame, mapGameToDbRow, type DbGameUpsertRow } from './game-mapper'
import { getHostSecret, hashHostSecret, HOST_SECRET_HEADER } from './host-secret'
import {
  loadGameHistory,
  saveGameHistory,
  loadCurrentGame,
  getDeletedGameIds,
  getGameFromHistory,
  getGuestId,
  getPendingSyncIds,
  markPendingSync,
  unmarkPendingSync,
  recordSyncFailure,
  clearSyncMeta,
  isSyncExhausted,
  isSyncBackedOff,
} from './storage'

/**
 * Error codes that will never succeed on a retry: the request is malformed or
 * forbidden, not unlucky. Anything else — network failure, an expired token, a
 * 5xx — is worth trying again, so it stays out of this list.
 */
const PERMANENT_ERROR_CODES = new Set([
  // Postgres
  '42501', // insufficient_privilege — refused by RLS
  '42703', // undefined_column — from a trigger or function
  '22P02', // invalid_text_representation
  '22001', // string_data_right_truncation
  '22003', // numeric_value_out_of_range
  '22007', // invalid_datetime_format
  '22008', // datetime_field_overflow
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23505', // unique_violation
  '23514', // check_violation
  // PostgREST. A payload key with no matching column is rejected here, before
  // Postgres sees it — so an unknown column arrives as PGRST204, never as
  // 42703, and used to be retried as if it were a network blip.
  'PGRST204', // column not found — client is newer than the schema
  'PGRST102', // invalid request body
])

/**
 * Why a write did not land:
 *  - 'retry': worth trying again later (offline, 5xx, auth lookup failed)
 *  - 'refused': the server will refuse it again; stop trying
 *  - 'other-account': the game belongs to an account that is not signed in.
 *    Writing it anonymously would disown it and dropping it would lose it, so
 *    it waits until that account is back.
 */
export type SyncFailure = 'retry' | 'refused' | 'other-account'

export type UpsertOutcome =
  | { ok: true }
  | { ok: false; failure: SyncFailure; message: string }

type SupabaseClient = ReturnType<typeof createClient>
type AuthUser = { id: string; email?: string }
type IdentityLookup = { ok: true; user: AuthUser | null } | { ok: false; message: string }

/*
 * Who is signed in, asked once per session instead of before every write.
 * During a shared game the host writes on every shot, and each write used to
 * pay for a getUser round trip and a profile upsert first. Keyed by client so
 * that a different client (in tests, every test) starts from scratch.
 */
const identityCache = new WeakMap<SupabaseClient, Promise<IdentityLookup>>()
const watchedClients = new WeakSet<SupabaseClient>()
const ensuredProfiles = new WeakMap<SupabaseClient, Set<string>>()

async function lookUpIdentity(supabase: SupabaseClient): Promise<IdentityLookup> {
  try {
    const { data, error } = await supabase.auth.getUser()
    // No session is a real answer — a guest. Anything else (offline, a 5xx
    // from auth) says nothing about who is signed in, and must not be taken
    // for "nobody": the game would go out unowned, RLS would refuse it with
    // 42501, and that refusal counts as permanent.
    if (error && !isAuthSessionMissingError(error)) {
      return { ok: false, message: error.message }
    }
    return { ok: true, user: data.user ?? null }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Auth lookup failed' }
  }
}

async function currentIdentity(supabase: SupabaseClient): Promise<IdentityLookup> {
  if (!watchedClients.has(supabase)) {
    watchedClients.add(supabase)
    // The cached answer is only good until somebody signs in or out
    supabase.auth.onAuthStateChange((event) => {
      if (event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') {
        identityCache.delete(supabase)
      }
    })
  }

  let lookup = identityCache.get(supabase)
  if (!lookup) {
    lookup = lookUpIdentity(supabase)
    identityCache.set(supabase, lookup)
  }

  const result = await lookup
  // Only a definite answer is worth keeping
  if (!result.ok && identityCache.get(supabase) === lookup) {
    identityCache.delete(supabase)
  }
  return result
}

/**
 * The leaderboard reads display_name from here, so a profile has to exist
 * before the first game lands. Written with ignoreDuplicates so a custom name
 * is never overwritten, and once per account per session.
 */
async function ensurePlayerProfile(supabase: SupabaseClient, user: AuthUser): Promise<void> {
  let ensured = ensuredProfiles.get(supabase)
  if (!ensured) {
    ensured = new Set()
    ensuredProfiles.set(supabase, ensured)
  }
  if (ensured.has(user.id)) return

  const { error } = await supabase.from('player_profiles').upsert(
    { user_id: user.id, display_name: user.email?.split('@')[0] || 'Player' },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )

  if (error) {
    console.warn('Failed to ensure player profile:', error.message)
    return
  }
  ensured.add(user.id)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The created_by to write, decided by who created the game rather than by who
 * happens to be signed in when the write goes out. null when the game belongs
 * to an account that is not signed in.
 *
 * A game created as a guest on this device carries this device's guest id
 * (or, from older bundles, nothing at all, or the pre-UUID "guest_…" id) and
 * follows whoever is signed in now: anonymously it is written unowned, and its
 * first INSERT after signing in legitimately adopts it. Any other creator is an
 * auth uid, and only that account may write the game.
 */
function rowOwner(game: Game, userId: string | null): { createdBy: string | null } | null {
  const creator = game.createdBy ?? null
  const isGuestGame = creator === null || !UUID_RE.test(creator) || creator === getGuestId()
  if (isGuestGame || creator === userId) return { createdBy: userId }
  return null
}

/**
 * The upsert itself. With the host secret on every request: since 00016 an
 * anon write to a game whose row carries a hash is refused without it, and a
 * header on a row without one is ignored. Per request, not on the client — the
 * browser client is shared by everything else, and the secret belongs to one
 * game.
 */
function sendGameRow(supabase: SupabaseClient, row: DbGameUpsertRow, secret: string | null) {
  const request = supabase.from('games').upsert(row, { onConflict: 'id' })
  return secret ? request.setHeader(HOST_SECRET_HEADER, secret) : request
}

/** PostgREST does not know the column: the schema predates 00016 */
function isMissingHashColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'PGRST204' && !!error.message?.includes('host_secret_hash')
}

/**
 * The only place that writes a row into `games`. Everything goes through
 * writeGameRow below, which keeps the writes for one game in order.
 */
async function upsertGameRow(game: Game): Promise<UpsertOutcome> {
  try {
    const supabase = createClient()
    const identity = await currentIdentity(supabase)
    if (!identity.ok) {
      console.error('Could not tell who is signed in, will retry:', identity.message)
      return { ok: false, failure: 'retry', message: identity.message }
    }

    const owner = rowOwner(game, identity.user?.id ?? null)
    if (!owner) {
      return {
        ok: false,
        failure: 'other-account',
        message: 'This game belongs to an account that is not signed in',
      }
    }

    if (identity.user) await ensurePlayerProfile(supabase, identity.user)

    // Only a game this device started has a secret. One started by an older
    // bundle, or a signed-in user's game merged in from another device, is
    // written as it always was. (A spectator never gets here: GameProvider
    // sends nothing in spectator mode.)
    const secret = getHostSecret(game.id)
    const row = mapGameToDbRow(game, owner.createdBy, secret ? await hashHostSecret(secret) : null)

    let response = await sendGameRow(supabase, row, secret)
    if (row.host_secret_hash && isMissingHashColumn(response.error)) {
      // The database is older than 00016, or PostgREST has not reloaded its
      // schema yet. Refused, a finished game would leave the retry queue;
      // written without the hash it is merely unprotected, as every game was
      // before.
      console.warn('[sync] games has no host_secret_hash column yet, writing without it')
      const legacyRow: DbGameUpsertRow = { ...row }
      delete legacyRow.host_secret_hash
      response = await sendGameRow(supabase, legacyRow, secret)
    }

    const { error } = response
    if (error) {
      const message = `${error.message}${error.details ? ` - ${error.details}` : ''}`
      console.error('Failed to sync game to Supabase:', message, error.code)
      return {
        ok: false,
        failure: PERMANENT_ERROR_CODES.has(error.code ?? '') ? 'refused' : 'retry',
        message,
      }
    }

    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error syncing game to Supabase:', message)
    return { ok: false, failure: 'retry', message }
  }
}

/*
 * One write per game in flight at a time; anything sent meanwhile waits, and
 * only the newest waiting state goes out — every write is the whole row, so
 * the ones in between carry nothing the last one does not.
 *
 * Unordered writes were how a stale state could end up in the database: during
 * a shared game every shot fired its own upsert, and nothing stopped the one
 * for shot N from landing after the one for shot N+1. The same applies to the
 * completion pipeline and the retry queue writing the same game.
 */
interface WriteSlot {
  next: Game | null
  waiters: Array<(outcome: UpsertOutcome) => void>
}

const writeSlots = new Map<string, WriteSlot>()

async function drainWrites(gameId: string, slot: WriteSlot): Promise<void> {
  while (slot.next) {
    const game = slot.next
    const waiters = slot.waiters
    slot.next = null
    slot.waiters = []
    const outcome = await upsertGameRow(game)
    // A coalesced caller learns the fate of the newer state that replaced its
    // own, which is the one that matters
    waiters.forEach(resolve => resolve(outcome))
  }
  writeSlots.delete(gameId)
}

function writeGameRow(game: Game): Promise<UpsertOutcome> {
  return new Promise(resolve => {
    const busy = writeSlots.get(game.id)
    if (busy) {
      busy.next = game
      busy.waiters.push(resolve)
      return
    }
    const slot: WriteSlot = { next: game, waiters: [resolve] }
    writeSlots.set(game.id, slot)
    void drainWrites(game.id, slot)
  })
}

/**
 * Sync all games from localStorage to Supabase
 */
export async function syncAllGamesToSupabase(): Promise<{
  success: number
  skipped: number
  refused: number
  failed: number
  /** Created under an account that is not signed in; kept for when it is */
  otherAccount: number
  total: number
}> {
  const games = loadGameHistory()
  // Only completed games can be shared, so anything else is nothing to do —
  // not a failure. Counting them as failures is why this page always reported
  // "Failed: N" to anyone who had abandoned a game.
  const syncable = games.filter(game => game.status === 'completed')

  let success = 0
  let refused = 0
  let failed = 0
  let otherAccount = 0

  for (const game of syncable) {
    // via syncFinishedGame so a failure here joins the retry queue like any
    // other, and so a refusal is told apart from a retryable problem
    const result = await syncFinishedGame(game)
    if (result.ok) {
      success++
    } else if (result.failure === 'refused') {
      // Typically a game played before signing in: its row in Supabase has no
      // owner, and since nothing in the row proves who that owner is, the
      // account cannot claim it. Retrying will never help.
      refused++
    } else if (result.failure === 'other-account') {
      otherAccount++
    } else {
      failed++
    }
  }

  return {
    success,
    skipped: games.length - syncable.length,
    refused,
    failed,
    otherAccount,
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
 * Upload a finished game — completed, or abandoned by its host — for both
 * signed-in users and guests. The game is queued before the attempt and leaves
 * the queue only once the write is confirmed, so a tab closed mid-request
 * still has it retried by retryPendingSyncs().
 */
export async function syncFinishedGame(game: Game): Promise<UpsertOutcome> {
  if (game.status !== 'completed' && game.status !== 'abandoned') {
    return { ok: false, failure: 'refused', message: 'Only finished games can be synced' }
  }

  markPendingSync(game.id)
  const result = await writeGameRow(game)
  settlePendingSync(game.id, result)
  return result
}

function settlePendingSync(gameId: string, result: UpsertOutcome): void {
  if (result.ok || result.failure === 'refused') {
    // Done, or never going to be: either way the queue has nothing left to do
    unmarkPendingSync(gameId)
  } else if (result.failure === 'other-account') {
    // Not an attempt — nothing was sent. The retry clock starts over once the
    // owner is back, instead of running out while they are away.
    clearSyncMeta(gameId)
  } else {
    recordSyncFailure(gameId)
  }
}

let retryInFlight = false

/**
 * Retry uploading finished games whose upload was never confirmed (finished
 * offline, tab closed mid-request, owner signed out).
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
        // Refused outright, or failing for two weeks. Leaving it queued would
        // mean a request on every tab switch, forever, that can never succeed.
        console.warn('[sync] giving up on game after repeated failures:', id)
        unmarkPendingSync(id)
        continue
      }
      if (isSyncBackedOff(id)) continue
      // Its first attempt is still running
      if (writeSlots.has(id)) continue

      const game = getGameFromHistory(id)
      if (!game) {
        // Game was deleted from history — nothing left to sync
        unmarkPendingSync(id)
        continue
      }

      // A win that was taken back: the game is being played again, and the
      // finished copy in history is no longer what happened. Whatever it ends
      // as replaces that copy and is synced then.
      const current = loadCurrentGame()
      if (current?.id === id && current.status === 'active') continue

      const result = await writeGameRow(game)
      settlePendingSync(id, result)
      if (result.ok) {
        const { checkAchievementsForGame, emitUnlockedAchievements } = await import('./achievements')
        emitUnlockedAchievements(await checkAchievementsForGame(game))
      }
    }
  } finally {
    retryInFlight = false
  }
}

/**
 * Write the current state of a game that is still being played — for live
 * sharing, where spectators follow the row. Works for games of any status,
 * and is never queued: a later state replaces it anyway, and the final one
 * goes through syncFinishedGame.
 */
export function syncActiveGameToSupabase(game: Game): Promise<UpsertOutcome> {
  return writeGameRow(game)
}
