/**
 * Game Insights for Killerpool
 *
 * Streaks, per-player statistics and end-of-game awards, read from a game's
 * history. Pure functions: no React, no storage, no clock.
 *
 * History is the only source. Undo removes the last entry, so whatever an
 * undone shot added — a streak, a pot, an elimination — is gone from every
 * figure here the moment the shot is taken back. A player added mid-game has
 * no entries before their first turn and is simply counted from there.
 */

import type { Game, GameAction, GameHistoryEntry } from './types'

/** Shortest streak the game screen shows a badge for */
export const STREAK_BADGE_MIN = 2

/** Streak at which a player is "on fire" */
export const ON_FIRE_STREAK = 3

/** Below these an award is not given: nobody gets a prize for nothing */
export const AWARD_THRESHOLDS = {
  /** MVP: balls potted, blacks included */
  mvpPots: 3,
  /** Hot Streak: pots in a row */
  hotStreak: 3,
  /** Black Ball Master: blacks potted */
  blackBalls: 2,
  /** Sniper: turns taken, so two lucky shots do not make a sniper */
  sniperTurns: 5,
  /** Sniper: percentage of turns that potted a ball */
  sniperAccuracyPercent: 60,
  /** Survivor: shots taken on the last life without going out */
  survivorShots: 3,
  /** First Out: players in the game; with two, first out is simply the loser */
  firstOutPlayers: 3,
} as const

export type AwardId =
  | 'mvp'
  | 'comeback'
  | 'hot_streak'
  | 'black_ball_master'
  | 'sniper'
  | 'survivor'
  | 'first_out'

export interface Award {
  id: AwardId
  title: string
  emoji: string
  playerId: string
  /** What earned it, e.g. "7 balls potted" or "streak of 5" */
  detail: string
}

export interface PlayerStats {
  playerId: string
  name: string
  avatar: string
  /** Shots taken */
  turns: number
  /** Balls potted, blacks included */
  pots: number
  blacks: number
  misses: number
  /** pots / turns, 0 before the first turn */
  accuracy: number
  /** Most pots in a row over the whole game */
  longestStreak: number
  /** Pots in a row up to and including the player's latest shot */
  currentStreak: number
  /** Lives before the first shot; a player who has not played yet has their current lives */
  startingLives: number
  /** Fewest lives at any point, 0 for a player who went out */
  minLives: number
  wasOnLastLife: boolean
  /** Shots taken on one life that did not put the player out */
  lastLifeShotsSurvived: number
  /** 1 for the first player out, 2 for the second…; null while still in */
  eliminationOrder: number | null
  /** 1-based number of the shot that put the player out, counted over the whole game */
  eliminatedAtShot: number | null
  isWinner: boolean
}

/** What the latest shot did, for anything that reacts to shots as they happen */
export interface ShotInsight {
  /** 0-based position in history */
  index: number
  playerId: string
  playerName: string
  action: GameAction
  livesBefore: number
  livesAfter: number
  /** The shooter's streak after this shot: 0 after a miss */
  streak: number
  /** The streak a miss just ended, 0 for anything else */
  streakEnded: number
  eliminated: boolean
  /** Down to the last life with this shot */
  droppedToLastLife: boolean
  /** Was on the last life and potted a black to get off it */
  escapedLastLife: boolean
  /** Players still in after this shot */
  playersLeft: number
}

const isPot = (action: GameAction) => action !== 'miss'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Each history entry with its position, grouped by the player who took it */
function entriesByPlayer(game: Game): Map<string, { entry: GameHistoryEntry; index: number }[]> {
  const byPlayer = new Map<string, { entry: GameHistoryEntry; index: number }[]>()
  game.history.forEach((entry, index) => {
    const list = byPlayer.get(entry.playerId)
    if (list) list.push({ entry, index })
    else byPlayer.set(entry.playerId, [{ entry, index }])
  })
  return byPlayer
}

/**
 * Pots in a row the player has right now, counted back from their latest
 * shot. Other players' shots in between do not break it; the player's own
 * miss does. 0 for a player who has not played or whose last shot missed.
 */
export function getCurrentStreak(game: Game, playerId: string): number {
  let streak = 0
  for (let i = game.history.length - 1; i >= 0; i--) {
    const entry = game.history[i]
    if (entry.playerId !== playerId) continue
    if (!isPot(entry.action)) break
    streak++
  }
  return streak
}

/**
 * A player's statistics, plus the shot (history index) at which each count
 * first reached its final value — what ties between players are broken on.
 */
interface PlayerTally {
  stats: PlayerStats
  potsReachedAt: number
  blacksReachedAt: number
  longestStreakReachedAt: number
  lastLifeShotsReachedAt: number
}

function tallyPlayers(game: Game): PlayerTally[] {
  const byPlayer = entriesByPlayer(game)
  const isCompleted = game.status === 'completed' && !!game.winnerId

  const tallies = game.players.map((player): PlayerTally => {
    const entries = byPlayer.get(player.id) ?? []
    const startingLives = entries.length > 0 ? entries[0].entry.livesBefore : player.lives
    const stats: PlayerStats = {
      playerId: player.id,
      name: player.name,
      avatar: player.avatar,
      turns: entries.length,
      pots: 0,
      blacks: 0,
      misses: 0,
      accuracy: 0,
      longestStreak: 0,
      currentStreak: 0,
      startingLives,
      minLives: startingLives,
      // A player can start on one life: one added mid-game gets the fewest
      // lives anybody still in has
      wasOnLastLife: startingLives === 1,
      lastLifeShotsSurvived: 0,
      eliminationOrder: null,
      eliminatedAtShot: null,
      isWinner: isCompleted && game.winnerId === player.id,
    }
    const tally: PlayerTally = {
      stats,
      potsReachedAt: -1,
      blacksReachedAt: -1,
      longestStreakReachedAt: -1,
      lastLifeShotsReachedAt: -1,
    }

    let run = 0
    for (const { entry, index } of entries) {
      if (entry.livesAfter === 1) stats.wasOnLastLife = true
      stats.minLives = Math.min(stats.minLives, entry.livesAfter)

      if (isPot(entry.action)) {
        stats.pots++
        tally.potsReachedAt = index
        if (entry.action === 'pot_black') {
          stats.blacks++
          tally.blacksReachedAt = index
        }
        run++
        if (run > stats.longestStreak) {
          stats.longestStreak = run
          tally.longestStreakReachedAt = index
        }
      } else {
        stats.misses++
        run = 0
      }

      // On one life and still in after the shot: a pot, or a black off it
      if (entry.livesBefore === 1 && entry.livesAfter > 0) {
        stats.lastLifeShotsSurvived++
        tally.lastLifeShotsReachedAt = index
      }

      if (entry.livesAfter <= 0) {
        stats.eliminatedAtShot = index + 1
      }
    }

    stats.currentStreak = run
    stats.accuracy = stats.turns > 0 ? stats.pots / stats.turns : 0
    return tally
  })

  // The order of going out follows the shots that did it
  tallies
    .map((t) => t.stats)
    .filter((s) => s.eliminatedAtShot !== null)
    .sort((a, b) => a.eliminatedAtShot! - b.eliminatedAtShot!)
    .forEach((s, i) => {
      s.eliminationOrder = i + 1
    })

  return tallies
}

/**
 * Statistics for every player in the game, in seat order. Entries for a
 * player who is no longer in the game are ignored.
 */
export function getPlayerStats(game: Game): PlayerStats[] {
  return tallyPlayers(game).map((t) => t.stats)
}

/**
 * Players in finishing order: the winner, then those still in (seat order),
 * then the eliminated from last out to first out. For a game without a
 * winner the same order reads as "who was still standing when it stopped".
 */
export function sortByStanding<T extends Pick<PlayerStats, 'isWinner' | 'eliminationOrder'>>(
  stats: T[]
): T[] {
  const rank = (s: T) => (s.isWinner ? 0 : s.eliminationOrder === null ? 1 : 2)
  return stats
    .map((s, seat) => ({ s, seat }))
    .sort((a, b) => {
      const byRank = rank(a.s) - rank(b.s)
      if (byRank !== 0) return byRank
      if (a.s.eliminationOrder !== null && b.s.eliminationOrder !== null) {
        return b.s.eliminationOrder - a.s.eliminationOrder
      }
      return a.seat - b.seat
    })
    .map(({ s }) => s)
}

/**
 * The one player with the highest value, if it is at least `min`. A tie goes
 * to whoever got there first — the earlier shot — and two players never share
 * a shot, so there is always exactly one.
 */
function leader(
  tallies: PlayerTally[],
  value: (s: PlayerStats) => number,
  reachedAt: (t: PlayerTally) => number,
  min: number
): PlayerStats | undefined {
  let best: PlayerTally | undefined
  for (const t of tallies) {
    const v = value(t.stats)
    if (v < min) continue
    if (!best || v > value(best.stats) || (v === value(best.stats) && reachedAt(t) < reachedAt(best))) {
      best = t
    }
  }
  return best?.stats
}

/**
 * Best accuracy over enough turns. More turns breaks a tie (the same rate over
 * a longer run); an exact tie, same pots from the same turns, gives nobody.
 */
function pickSniper(tallies: PlayerTally[]): PlayerStats | undefined {
  const eligible = tallies
    .map((t) => t.stats)
    .filter(
      (s) =>
        s.turns >= AWARD_THRESHOLDS.sniperTurns &&
        // In whole numbers: 3 of 5 is exactly 60%, with no rounding to fall short
        s.pots * 100 >= s.turns * AWARD_THRESHOLDS.sniperAccuracyPercent
    )
  // Compared as cross products, so 4 of 5 and 8 of 10 are equal without rounding
  const compare = (a: PlayerStats, b: PlayerStats) =>
    b.pots * a.turns - a.pots * b.turns || b.turns - a.turns
  const [best, second] = eligible.sort(compare)
  if (!best || (second && compare(best, second) === 0)) return undefined
  return best
}

/**
 * Whether the winner was on their last life while somebody else still had
 * more: trailing, one miss from going out. Sitting on one life at the same
 * time as everybody else is not a comeback.
 *
 * Lives are replayed shot by shot. A player is only counted from their own
 * first shot: nothing records when a player added mid-game joined, and
 * counting them any earlier could invent a lead they never had.
 */
function winnerCameBack(game: Game, winnerId: string): boolean {
  const lives = new Map<string, number>()
  for (const entry of game.history) {
    lives.set(entry.playerId, entry.livesAfter)
    if (lives.get(winnerId) !== 1) continue
    for (const [playerId, playerLives] of lives) {
      if (playerId !== winnerId && playerLives > 1) return true
    }
  }
  return false
}

/**
 * Awards for a finished game, in a fixed order. A player can collect several.
 * An abandoned game, or one still being played, gets none.
 *
 * Every award has a threshold (AWARD_THRESHOLDS), so a short or scrappy game
 * may hand out few or none. A tie on the deciding figure goes to whoever
 * reached it first; for Sniper, which has no such moment, see pickSniper.
 */
export function computeAwards(game: Game): Award[] {
  if (game.status !== 'completed' || !game.winnerId) return []
  const winnerId = game.winnerId
  if (!game.players.some((p) => p.id === winnerId)) return []

  const tallies = tallyPlayers(game)
  const awards: Award[] = []

  const mvp = leader(tallies, (s) => s.pots, (t) => t.potsReachedAt, AWARD_THRESHOLDS.mvpPots)
  if (mvp) {
    awards.push({
      id: 'mvp',
      title: 'MVP',
      emoji: '🏅',
      playerId: mvp.playerId,
      detail: plural(mvp.pots, 'ball potted', 'balls potted'),
    })
  }

  if (winnerCameBack(game, winnerId)) {
    awards.push({
      id: 'comeback',
      title: 'Comeback',
      emoji: '💪',
      playerId: winnerId,
      detail: 'won from the last life',
    })
  }

  const streak = leader(
    tallies,
    (s) => s.longestStreak,
    (t) => t.longestStreakReachedAt,
    AWARD_THRESHOLDS.hotStreak
  )
  if (streak) {
    awards.push({
      id: 'hot_streak',
      title: 'Hot Streak',
      emoji: '🔥',
      playerId: streak.playerId,
      detail: `streak of ${streak.longestStreak}`,
    })
  }

  const blacks = leader(tallies, (s) => s.blacks, (t) => t.blacksReachedAt, AWARD_THRESHOLDS.blackBalls)
  if (blacks) {
    awards.push({
      id: 'black_ball_master',
      title: 'Black Ball Master',
      emoji: '🎱',
      playerId: blacks.playerId,
      detail: plural(blacks.blacks, 'black', 'blacks'),
    })
  }

  const sniper = pickSniper(tallies)
  if (sniper) {
    awards.push({
      id: 'sniper',
      title: 'Sniper',
      emoji: '🎯',
      playerId: sniper.playerId,
      detail: `${Math.round(sniper.accuracy * 100)}% · ${sniper.pots} of ${sniper.turns}`,
    })
  }

  const survivor = leader(
    tallies,
    (s) => s.lastLifeShotsSurvived,
    (t) => t.lastLifeShotsReachedAt,
    AWARD_THRESHOLDS.survivorShots
  )
  if (survivor) {
    awards.push({
      id: 'survivor',
      title: 'Survivor',
      emoji: '🛡️',
      playerId: survivor.playerId,
      detail: `${plural(survivor.lastLifeShotsSurvived, 'shot', 'shots')} on the last life`,
    })
  }

  if (game.players.length >= AWARD_THRESHOLDS.firstOutPlayers) {
    const firstOut = tallies.find((t) => t.stats.eliminationOrder === 1)?.stats
    if (firstOut) {
      awards.push({
        id: 'first_out',
        title: 'First Out',
        emoji: '🚪',
        playerId: firstOut.playerId,
        detail: `out after ${plural(firstOut.turns, 'turn', 'turns')}`,
      })
    }
  }

  return awards
}

/**
 * What the latest shot did, or null before the first one. playersLeft is
 * read from the game as it stands, which is the state right after that shot.
 */
export function getLastShotInsight(game: Game): ShotInsight | null {
  const index = game.history.length - 1
  if (index < 0) return null
  const entry = game.history[index]

  let streakEnded = 0
  if (!isPot(entry.action)) {
    for (let i = index - 1; i >= 0; i--) {
      const earlier = game.history[i]
      if (earlier.playerId !== entry.playerId) continue
      if (!isPot(earlier.action)) break
      streakEnded++
    }
  }

  return {
    index,
    playerId: entry.playerId,
    playerName: entry.playerName,
    action: entry.action,
    livesBefore: entry.livesBefore,
    livesAfter: entry.livesAfter,
    streak: getCurrentStreak(game, entry.playerId),
    streakEnded,
    eliminated: entry.livesAfter <= 0,
    droppedToLastLife: entry.livesAfter === 1 && entry.livesBefore > 1,
    escapedLastLife: entry.livesBefore === 1 && entry.livesAfter > 1,
    playersLeft: game.players.filter((p) => !p.eliminated).length,
  }
}
