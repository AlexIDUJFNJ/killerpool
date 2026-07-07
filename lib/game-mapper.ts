/**
 * Mapping between Supabase `games` rows (snake_case) and the client `Game` type.
 *
 * The database stores participants/history as JSONB in the client's own shape,
 * so only the top-level fields need conversion. Full ruleset params are not
 * stored per game (only a nullable ruleset_id), and every game so far uses the
 * classic rules — restored games fall back to DEFAULT_RULESET.
 */

import { Game, Player, DEFAULT_RULESET } from './types'

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
