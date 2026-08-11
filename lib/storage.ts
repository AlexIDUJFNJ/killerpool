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
  } catch (error) {
    console.error('Failed to clear game from localStorage:', error)
  }
}

/** Games kept in local history */
export const MAX_HISTORY_GAMES = 50

/**
 * Replace the stored game history. The only writer of the history key, so the
 * cap lives in one place.
 */
export function saveGameHistory(games: Game[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.GAME_HISTORY,
      JSON.stringify(games.slice(0, MAX_HISTORY_GAMES))
    )
  } catch (error) {
    console.error('Failed to save game history:', error)
  }
}

/**
 * Save completed game to history
 */
export function saveToHistory(game: Game): void {
  if (game.status !== 'completed') {
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
 * Clear all game history
 */
export function clearGameHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.GAME_HISTORY)
  } catch (error) {
    console.error('Failed to clear game history:', error)
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
 * Check if there's a current game in progress
 */
export function hasCurrentGame(): boolean {
  return loadCurrentGame() !== null
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
 * Get unique player names from game history for autocomplete
 */
export function getPlayerNamesSuggestions(): string[] {
  try {
    const history = loadGameHistory()
    const namesSet = new Set<string>()

    // Extract all player names from history
    history.forEach(game => {
      game.players.forEach(player => {
        if (player.name.trim()) {
          namesSet.add(player.name)
        }
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
 * Get IDs of completed games that failed to sync to Supabase
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
 * Mark a game as pending sync (will be retried when back online)
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
