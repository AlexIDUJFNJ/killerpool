/**
 * LocalStorage utilities for Killerpool
 * 
 * Handles persistence of games and app state in browser localStorage.
 */

import { Game, NewGamePlayerInput } from './types'

const STORAGE_KEYS = {
  CURRENT_GAME: 'killerpool_current_game',
  GAME_HISTORY: 'killerpool_game_history',
  GUEST_ID: 'killerpool_guest_id',
  REMATCH_PLAYERS: 'killerpool_rematch_players',
  PENDING_SYNC: 'killerpool_pending_sync',
  DELETED_GAMES: 'killerpool_deleted_games',
  ROSTER: 'killerpool_roster',
  PENDING_SYNC_META: 'killerpool_pending_sync_meta',
  SHARED_GAME: 'killerpool_shared_game',
} as const

/**
 * Save current game to localStorage
 */
export function saveCurrentGame(game: Game): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_GAME, JSON.stringify(game))
  } catch (error) {
    console.error('Failed to save game to localStorage:', error)
  }
}

/**
 * Load current game from localStorage
 */
export function loadCurrentGame(): Game | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_GAME)
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('Failed to load game from localStorage:', error)
    return null
  }
}

/**
 * Clear current game from localStorage
 */
export function clearCurrentGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_GAME)
    localStorage.removeItem(STORAGE_KEYS.SHARED_GAME)
  } catch (error) {
    console.error('Failed to clear game from localStorage:', error)
  }
}

/**
 * Remember that the current game is being broadcast to spectators.
 *
 * Without this a reload silently stopped the broadcast: the host kept playing,
 * nothing reached Supabase any more, and every spectator's screen froze on the
 * last move before the reload. Kept under its own key, holding the game id,
 * so the stored game keeps the exact shape an older bundle still reads.
 */
export function markCurrentGameShared(gameId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SHARED_GAME, gameId)
  } catch (error) {
    console.error('Failed to remember game sharing:', error)
  }
}

/**
 * Whether this game was being shared when the page last saw it. Keyed by id,
 * so a marker left behind by an earlier game never applies to a new one.
 */
export function isCurrentGameShared(gameId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.SHARED_GAME) === gameId
  } catch {
    return false
  }
}

/** Games kept in local history */
export const MAX_HISTORY_GAMES = 50

/**
 * Fired on this tab's window whenever the stored history changes. The
 * browser's 'storage' event only reaches the other tabs.
 */
export const HISTORY_CHANGE_EVENT = 'killerpool-history-change'

/**
 * Replace the stored game history. The only writer of the history key, so the
 * cap lives in one place, and so is the change notification.
 */
export function saveGameHistory(games: Game[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.GAME_HISTORY,
      JSON.stringify(games.slice(0, MAX_HISTORY_GAMES))
    )
  } catch (error) {
    console.error('Failed to save game history:', error)
    return
  }
  window.dispatchEvent(new Event(HISTORY_CHANGE_EVENT))
}

/**
 * Calls onChange whenever the stored history changes, in this tab or in
 * another one. The subscribe half of a useSyncExternalStore store, with
 * readGameHistorySnapshot.
 */
export function subscribeToGameHistory(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // A null key means the whole storage was cleared
    if (event.key === STORAGE_KEYS.GAME_HISTORY || event.key === null) onChange()
  }
  window.addEventListener(HISTORY_CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(HISTORY_CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

const NO_GAMES: readonly Game[] = []
let historySnapshot: { raw: string | null; games: readonly Game[] } = { raw: null, games: NO_GAMES }

/**
 * The stored history, as useSyncExternalStore needs it: the same array for as
 * long as the stored value is the same (a fresh parse on every call would
 * re-render forever), so it must not be mutated. Use loadGameHistory for a
 * copy to change.
 */
export function readGameHistorySnapshot(): readonly Game[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEYS.GAME_HISTORY)
  } catch {
    return NO_GAMES
  }

  if (raw !== historySnapshot.raw) {
    let games = NO_GAMES
    try {
      games = raw ? JSON.parse(raw) : NO_GAMES
    } catch (error) {
      console.error('Failed to load game history:', error)
    }
    historySnapshot = { raw, games }
  }
  return historySnapshot.games
}

/**
 * Save a finished game to history: completed, or abandoned by its host.
 * Abandoned games used to be dropped here, so ending a game early erased it
 * without a trace. They have no winner, and achievements and the leaderboard
 * still count completed games only.
 */
export function saveToHistory(game: Game): void {
  if (game.status !== 'completed' && game.status !== 'abandoned') {
    return
  }

  try {
    // Explicitly adding a game back outranks an older deletion of it
    clearGameDeleted(game.id)

    // The same game can finish twice (undo a win, then play on), so replace the
    // earlier entry instead of stacking duplicates
    const history = loadGameHistory().filter(g => g.id !== game.id)
    history.unshift(game) // Add to beginning

    saveGameHistory(history)
  } catch (error) {
    console.error('Failed to save game to history:', error)
  }
}

/**
 * Load game history from localStorage
 */
export function loadGameHistory(): Game[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.GAME_HISTORY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Failed to load game history:', error)
    return []
  }
}

/**
 * Get a specific game from history by ID
 */
export function getGameFromHistory(gameId: string): Game | null {
  const history = loadGameHistory()
  return history.find(g => g.id === gameId) || null
}

/**
 * Delete a game from history
 */
export function deleteGameFromHistory(gameId: string): void {
  try {
    const history = loadGameHistory()
    saveGameHistory(history.filter(g => g.id !== gameId))
    // Without a tombstone the next merge pulls the game straight back from
    // Supabase, and it wins the comparison because its updated_at is newer
    markGameDeleted(gameId)
    unmarkPendingSync(gameId)
  } catch (error) {
    console.error('Failed to delete game from history:', error)
  }
}

/**
 * Get or create a stable guest ID for guest users
 * Returns a valid UUID that can be cast to PostgreSQL UUID type
 */
export function getGuestId(): string {
  try {
    let guestId = localStorage.getItem(STORAGE_KEYS.GUEST_ID)

    // Check if stored ID is a valid UUID (not the old "guest_xxx" format)
    const isValidUUID = guestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guestId)

    if (!guestId || !isValidUUID) {
      // Create a new valid UUID (without "guest_" prefix)
      guestId = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEYS.GUEST_ID, guestId)
    }

    return guestId
  } catch (error) {
    console.error('Failed to get/create guest ID:', error)
    return crypto.randomUUID()
  }
}

/**
 * A person who plays on this device.
 *
 * Their id is reused for every game they appear in, which is what makes the
 * leaderboard able to aggregate them: get_leaderboard groups by
 * COALESCE(participants[].userId, participants[].id), and only the game's
 * creator has a userId. Without a stable id every opponent shows up as a
 * separate one-game player.
 */
export interface RosterPlayer {
  id: string
  name: string
  avatar: string
  lastPlayedAt: number
}

const MAX_ROSTER = 100

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function loadRoster(): RosterPlayer[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.ROSTER)
    const parsed = data ? JSON.parse(data) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is RosterPlayer => typeof p?.id === 'string' && typeof p?.name === 'string'
    )
  } catch (error) {
    console.error('Failed to load roster:', error)
    return []
  }
}

function saveRoster(players: RosterPlayer[]): void {
  try {
    const trimmed = [...players]
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, MAX_ROSTER)
    localStorage.setItem(STORAGE_KEYS.ROSTER, JSON.stringify(trimmed))
  } catch (error) {
    console.error('Failed to save roster:', error)
  }
}

/**
 * Find a known player by name (case-insensitive)
 */
export function findRosterPlayer(name: string): RosterPlayer | null {
  const key = normalizeName(name)
  if (!key) return null
  return loadRoster().find(p => normalizeName(p.name) === key) ?? null
}

/**
 * Reuse the id of a known player, or mint one for somebody new.
 * Lowercase UUID: get_leaderboard drops ids that fail its UUID regex.
 */
export function resolveRosterPlayerId(name: string): string {
  return findRosterPlayer(name)?.id ?? crypto.randomUUID()
}

/**
 * Record the players of a game that just started, so their ids are reused next
 * time and their names show up in autocomplete.
 */
export function rememberRosterPlayers(
  players: Array<{ id: string; name: string; avatar: string }>
): void {
  const roster = loadRoster()
  const now = Date.now()

  for (const player of players) {
    if (!player.name.trim()) continue
    const existing = roster.findIndex(p => normalizeName(p.name) === normalizeName(player.name))
    const entry = { id: player.id, name: player.name.trim(), avatar: player.avatar, lastPlayedAt: now }
    if (existing >= 0) {
      // Keep the id already in use — renaming a person must not split their stats
      roster[existing] = { ...entry, id: roster[existing].id }
    } else {
      roster.push(entry)
    }
  }

  saveRoster(roster)
}

/**
 * Get unique player names for autocomplete: known players first, then anyone
 * who only appears in older games (from before the roster existed)
 */
export function getPlayerNamesSuggestions(): string[] {
  try {
    const namesSet = new Set<string>()

    loadRoster().forEach(player => {
      if (player.name.trim()) namesSet.add(player.name)
    })

    loadGameHistory().forEach(game => {
      game.players.forEach(player => {
        if (player.name.trim()) namesSet.add(player.name)
      })
    })

    // Convert to array and sort alphabetically
    return Array.from(namesSet).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    )
  } catch (error) {
    console.error('Failed to get player names:', error)
    return []
  }
}

/**
 * Ids of finished games whose upload has not been confirmed yet
 */
export function getPendingSyncIds(): string[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC)
    const ids = data ? JSON.parse(data) : []
    return Array.isArray(ids) ? ids : []
  } catch (error) {
    console.error('Failed to load pending sync ids:', error)
    return []
  }
}

/**
 * Queue a game for upload. Callers do this before the attempt, not after it
 * fails, so a tab closed mid-request still leaves the game in the queue.
 */
export function markPendingSync(gameId: string): void {
  try {
    const ids = getPendingSyncIds()
    if (!ids.includes(gameId)) {
      ids.push(gameId)
      localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(ids))
    }
  } catch (error) {
    console.error('Failed to mark game as pending sync:', error)
  }
}

/**
 * Remove a game from the pending sync list
 */
export function unmarkPendingSync(gameId: string): void {
  try {
    const ids = getPendingSyncIds()
    const filtered = ids.filter(id => id !== gameId)
    if (filtered.length !== ids.length) {
      localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(filtered))
    }
    clearSyncMeta(gameId)
  } catch (error) {
    console.error('Failed to unmark pending sync:', error)
  }
}

const TOMBSTONE_TTL_MS = 365 * 24 * 60 * 60 * 1000
const MAX_TOMBSTONES = 200

interface Tombstone {
  id: string
  deletedAt: number
}

function readTombstones(): Tombstone[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.DELETED_GAMES)
    const parsed = data ? JSON.parse(data) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(entry =>
        typeof entry === 'string' ? { id: entry, deletedAt: Date.now() } : entry
      )
      .filter((entry): entry is Tombstone => typeof entry?.id === 'string')
  } catch (error) {
    console.error('Failed to load deleted game ids:', error)
    return []
  }
}

function writeTombstones(list: Tombstone[]): void {
  try {
    const now = Date.now()
    const pruned = list
      .filter(t => now - t.deletedAt < TOMBSTONE_TTL_MS)
      .sort((a, b) => b.deletedAt - a.deletedAt)
      .slice(0, MAX_TOMBSTONES)
    localStorage.setItem(STORAGE_KEYS.DELETED_GAMES, JSON.stringify(pruned))
  } catch (error) {
    console.error('Failed to save deleted game ids:', error)
  }
}

/**
 * Ids of games the user deleted locally, so a later merge does not restore them
 */
export function getDeletedGameIds(): Set<string> {
  const now = Date.now()
  return new Set(
    readTombstones()
      .filter(t => now - t.deletedAt < TOMBSTONE_TTL_MS)
      .map(t => t.id)
  )
}

/**
 * Remember that a game was deleted locally
 */
export function markGameDeleted(gameId: string): void {
  const list = readTombstones().filter(t => t.id !== gameId)
  list.push({ id: gameId, deletedAt: Date.now() })
  writeTombstones(list)
}

/**
 * Forget a deletion — the game was explicitly added back
 */
export function clearGameDeleted(gameId: string): void {
  const list = readTombstones()
  const filtered = list.filter(t => t.id !== gameId)
  if (filtered.length !== list.length) {
    writeTombstones(filtered)
  }
}

/**
 * Retry bookkeeping for the pending-sync queue.
 *
 * Kept in its own key so `killerpool_pending_sync` stays a plain array of ids:
 * this is a PWA, and a client running an older bundle from the service worker
 * cache would stop draining a queue whose shape changed under it.
 *
 * A game is retried until MAX_SYNC_AGE_MS after its first failure, with the
 * wait between attempts doubling up to BACKOFF_MAX_MS. There used to be a cap
 * of five attempts on top of that, which at a one-minute base meant giving up
 * after about a quarter of an hour — a phone that spent an evening offline
 * lost every game played that evening, and the two longer limits were never
 * reached.
 */
export const MAX_SYNC_AGE_MS = 14 * 24 * 60 * 60 * 1000
export const BACKOFF_BASE_MS = 60_000
export const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000

export interface PendingSyncMeta {
  attempts: number
  firstFailedAt: number
  lastAttemptAt: number
  /**
   * Set by older bundles on a refusal. A refused game now leaves the queue at
   * once (lib/sync.ts), but entries they wrote are still honoured.
   */
  permanent?: boolean
}

function readSyncMeta(): Record<string, PendingSyncMeta> {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC_META)
    const parsed = data ? JSON.parse(data) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (error) {
    console.error('Failed to load pending sync meta:', error)
    return {}
  }
}

function writeSyncMeta(meta: Record<string, PendingSyncMeta>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC_META, JSON.stringify(meta))
  } catch (error) {
    console.error('Failed to save pending sync meta:', error)
  }
}

/**
 * Note a failed attempt that is worth repeating
 */
export function recordSyncFailure(gameId: string, now = Date.now()): void {
  const meta = readSyncMeta()
  const existing = meta[gameId]

  meta[gameId] = {
    attempts: (existing?.attempts ?? 0) + 1,
    firstFailedAt: existing?.firstFailedAt ?? now,
    lastAttemptAt: now,
    permanent: existing?.permanent,
  }

  writeSyncMeta(meta)
}

/**
 * Whether to stop trying: refused outright, or failing for too long.
 * An id with no record (an older bundle queued it) is never exhausted.
 */
export function isSyncExhausted(gameId: string, now = Date.now()): boolean {
  const entry = readSyncMeta()[gameId]
  if (!entry) return false
  return entry.permanent === true || now - entry.firstFailedAt > MAX_SYNC_AGE_MS
}

/**
 * Whether the next attempt is still due. Without this, retryPendingSyncs hits
 * the network for every queued game on every visibilitychange — that is, on
 * every tab switch.
 */
export function isSyncBackedOff(gameId: string, now = Date.now()): boolean {
  const entry = readSyncMeta()[gameId]
  if (!entry) return false
  const wait = Math.min(BACKOFF_BASE_MS * 2 ** (entry.attempts - 1), BACKOFF_MAX_MS)
  return now - entry.lastAttemptAt < wait
}

/** Forget the retry history of a game (it synced, or left the queue) */
export function clearSyncMeta(gameId: string): void {
  const meta = readSyncMeta()
  if (gameId in meta) {
    delete meta[gameId]
    writeSyncMeta(meta)
  }
}

/**
 * Save players for rematch (to reuse in next game)
 */
export function saveRematchPlayers(players: NewGamePlayerInput[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.REMATCH_PLAYERS, JSON.stringify(players))
  } catch (error) {
    console.error('Failed to save rematch players:', error)
  }
}

/**
 * Load players for rematch and clear the storage
 */
export function loadRematchPlayers(): NewGamePlayerInput[] | null {
  try {
    const data = sessionStorage.getItem(STORAGE_KEYS.REMATCH_PLAYERS)
    if (data) {
      sessionStorage.removeItem(STORAGE_KEYS.REMATCH_PLAYERS)
      return JSON.parse(data)
    }
    return null
  } catch (error) {
    console.error('Failed to load rematch players:', error)
    return null
  }
}
