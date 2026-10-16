import type { Game } from '@/lib/types'

export type DateFilter = 'all' | 'today' | 'week' | 'month'
export type StatusFilter = 'all' | 'completed' | 'abandoned'

export interface HistoryFilters {
  query: string
  date: DateFilter
  status: StatusFilter
}

/**
 * History lists games that are over: won, or ended early with "End Game".
 *
 * Merging with Supabase also brings in the account's rows that are still
 * 'active' — games shared for live viewing and never finished there — and a
 * card for one of those has no result to show.
 */
export function isFinishedGame(game: Game): boolean {
  return game.status === 'completed' || game.status === 'abandoned'
}

/** The winner of a completed game; an abandoned game has none, whatever its winnerId says */
export function getGameWinner(game: Game) {
  if (game.status !== 'completed' || !game.winnerId) return undefined
  return game.players.find((p) => p.id === game.winnerId)
}

export function filterGames(games: Game[], filters: HistoryFilters, now = new Date()): Game[] {
  let filtered = games

  const query = filters.query.trim().toLowerCase()
  if (query) {
    filtered = filtered.filter((game) =>
      game.players.some((player) => player.name.toLowerCase().includes(query))
    )
  }

  if (filters.date !== 'all') {
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (filters.date === 'week') since.setDate(since.getDate() - 7)
    if (filters.date === 'month') since.setMonth(since.getMonth() - 1)
    filtered = filtered.filter((game) => new Date(game.createdAt) >= since)
  }

  if (filters.status !== 'all') {
    filtered = filtered.filter((game) => game.status === filters.status)
  }

  return filtered
}

const STAGGER_STEP_S = 0.05
const STAGGER_MAX_S = 0.4

/**
 * Entrance delay for the nth card. Capped: an uncapped `index * 0.1` kept
 * the 50th card of a full history invisible for five seconds.
 */
export function staggerDelay(index: number): number {
  return Math.min(index * STAGGER_STEP_S, STAGGER_MAX_S)
}

export function formatDuration(start: string, end: string): string {
  const duration = Math.max(0, new Date(end).getTime() - new Date(start).getTime())
  const minutes = Math.floor(duration / 60000)
  const seconds = Math.floor((duration % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
