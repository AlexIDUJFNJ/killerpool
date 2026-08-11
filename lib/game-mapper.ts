/**
 * Mapping between Supabase `games` rows (snake_case) and the client `Game` type.
 *
 * The database stores participants/history as JSONB in the client's own shape,
 * so only the top-level fields need conversion. Full ruleset params are not
 * stored per game (only a nullable ruleset_id), and every game so far uses the
 * classic rules — restored games fall back to DEFAULT_RULESET.
 */

import { Game, GameHistoryEntry, Player, DEFAULT_RULESET } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A row ready for upsert into `games`.
 *
 * Every column is always present. PostgREST builds the ON CONFLICT DO UPDATE
 * set from the keys of the payload, so a payload whose shape varies between
 * call sites makes the upsert itself behave differently — which is how three
 * copies of this object ended up writing three different column sets.
 */
export interface DbGameUpsertRow {
  id: string
  created_at: string
  updated_at: string
  status: 'active' | 'completed' | 'abandoned'
  participants: Player[]
  winner_id: string | null
  ruleset_id: string | null
  history: GameHistoryEntry[]
  created_by: string | null
  current_player_index: number
}

export function mapGameToDbRow(game: Game, createdBy: string | null): DbGameUpsertRow {
  return {
    id: game.id,
    created_at: game.createdAt,
    updated_at: game.updatedAt || new Date().toISOString(),
    // The client type allows 'setup', the game_status enum does not
    status: game.status === 'setup' ? 'active' : game.status,
    participants: game.players ?? [],
    winner_id: game.winnerId ?? null,
    // ruleset_id is a UUID column, but the default ruleset's id is 'classic'
    ruleset_id: game.rulesetId && UUID_RE.test(game.rulesetId) ? game.rulesetId : null,
    history: game.history ?? [],
    created_by: createdBy,
    current_player_index: Number.isInteger(game.currentPlayerIndex)
      ? game.currentPlayerIndex
      : 0,
  }
}

interface DbGameRow {
  id: string
  created_at: string
  updated_at: string
  status: Game['status']
  participants: Player[]
  winner_id: string | null
  ruleset_id: string | null
  history: Game['history'] | null
  created_by: string | null
  current_player_index?: number | null
}

export function mapDbGameToGame(row: DbGameRow): Game {
  const players = row.participants ?? []

  // Older rows predate the current_player_index column — fall back to the
  // first player who is still in the game
  let currentPlayerIndex = row.current_player_index ?? -1
  if (currentPlayerIndex < 0 || currentPlayerIndex >= players.length) {
    currentPlayerIndex = Math.max(
      0,
      players.findIndex((p) => !p.eliminated && p.lives > 0)
    )
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    players,
    currentPlayerIndex,
    winnerId: row.winner_id,
    rulesetId: row.ruleset_id ?? undefined,
    ruleset: DEFAULT_RULESET,
    history: row.history ?? [],
    createdBy: row.created_by,
  }
}
