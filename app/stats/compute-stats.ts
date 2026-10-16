import type { Game, Player } from '@/lib/types'

export interface PlayerStats {
  totalGames: number
  gamesWon: number
  gamesLost: number
  winRate: number
  totalActions: number
  totalMisses: number
  totalPots: number
  totalBlackPots: number
  averageLivesRemaining: number
  longestWinStreak: number
  currentStreak: number
  bestGame: {
    id: string
    date: string
    livesRemaining: number
  } | null
}

/**
 * The ids this device's player is known by.
 *
 * A game stores the creator's id on the player row marked "this is me"
 * (createGame), and that id is the auth user id when signed in, the device's
 * guest id otherwise. Games played before signing in keep the guest id, so
 * both have to count — keying on `user.id ?? guestId` made every guest game
 * vanish from /stats the moment the player signed in.
 */
export function getMyIds(userId: string | null | undefined, guestId: string | null | undefined): Set<string> {
  return new Set([userId, guestId].filter((id): id is string => !!id))
}

function findMe(game: Game, myIds: Set<string>): Player | undefined {
  return game.players.find((p) => !!p.userId && myIds.has(p.userId))
}

/**
 * Stats over the games this player took part in.
 *
 * Only completed games count. An abandoned game ("End Game" before anyone
 * won) has no result, so it is neither a win nor a loss, does not break or
 * extend a streak, and its half-played lives say nothing about performance.
 */
export function computeStats(games: Game[], myIds: Set<string>): PlayerStats | null {
  const playerGames = games
    .filter((game) => game.status === 'completed')
    .map((game) => ({ game, me: findMe(game, myIds) }))
    .filter((entry): entry is { game: Game; me: Player } => entry.me !== undefined)

  if (playerGames.length === 0) return null

  const isWin = ({ game, me }: { game: Game; me: Player }) =>
    !!game.winnerId && game.winnerId === me.id

  const gamesWon = playerGames.filter(isWin).length

  // Streaks, oldest game first
  const chronological = [...playerGames].sort(
    (a, b) => new Date(a.game.createdAt).getTime() - new Date(b.game.createdAt).getTime()
  )
  let longestWinStreak = 0
  let streak = 0
  for (const entry of chronological) {
    streak = isWin(entry) ? streak + 1 : 0
    longestWinStreak = Math.max(longestWinStreak, streak)
  }
  const currentStreak = streak

  let totalMisses = 0
  let totalPots = 0
  let totalBlackPots = 0
  let totalLivesRemaining = 0
  let bestGame: PlayerStats['bestGame'] = null

  for (const { game, me } of playerGames) {
    for (const h of game.history) {
      if (h.playerId !== me.id) continue
      if (h.action === 'miss') totalMisses++
      else if (h.action === 'pot') totalPots++
      else if (h.action === 'pot_black') totalBlackPots++
    }
    totalLivesRemaining += me.lives

    if (!bestGame || me.lives > bestGame.livesRemaining) {
      bestGame = { id: game.id, date: game.createdAt, livesRemaining: me.lives }
    }
  }

  return {
    totalGames: playerGames.length,
    gamesWon,
    gamesLost: playerGames.length - gamesWon,
    winRate: (gamesWon / playerGames.length) * 100,
    totalActions: totalMisses + totalPots + totalBlackPots,
    totalMisses,
    totalPots,
    totalBlackPots,
    averageLivesRemaining: totalLivesRemaining / playerGames.length,
    longestWinStreak,
    currentStreak,
    bestGame,
  }
}
