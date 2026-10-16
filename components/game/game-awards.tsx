'use client'

import * as React from 'react'
import { motion } from 'motion/react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Game } from '@/lib/types'
import {
  computeAwards,
  getPlayerStats,
  sortByStanding,
  type Award,
  type AwardId,
  type PlayerStats,
} from '@/lib/game-insights'
import { ACTION_STYLES } from './action-styles'

/**
 * Each award's tint. Where an award is about a kind of shot or a number of
 * lives it borrows that colour: emerald for blacks, red for the last life
 * (the colour of a single remaining life), neutral slate for going out.
 */
const AWARD_TINT: Record<AwardId, string> = {
  mvp: 'bg-amber-500/10 border-amber-500/30',
  comeback: 'bg-violet-500/10 border-violet-500/30',
  hot_streak: 'bg-orange-500/10 border-orange-500/30',
  black_ball_master: ACTION_STYLES.pot_black.surface,
  sniper: 'bg-sky-500/10 border-sky-500/30',
  survivor: ACTION_STYLES.miss.surface,
  first_out: ACTION_STYLES.pot.surface,
}

/** The awards come in one after another once the winner screen has settled */
const FIRST_AWARD_DELAY_S = 0.5
const AWARD_STEP_S = 0.12

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * Where the player finished, then their turns. A won game has places:
 * "Winner", "2nd" for the last one out, and so on down to the first out. A
 * game that ended without a winner has no places, only "Out 1st"… for those
 * who went out and the lives left for those still in.
 */
function standing(stats: PlayerStats, playerCount: number, decided: boolean): string {
  let place: string
  if (stats.isWinner) {
    place = 'Winner'
  } else if (stats.eliminationOrder !== null) {
    place = decided
      ? ordinal(playerCount - stats.eliminationOrder + 1)
      : `Out ${ordinal(stats.eliminationOrder)}`
  } else {
    place = `${stats.lives} ${stats.lives === 1 ? 'life' : 'lives'} left`
  }
  return `${place} · ${stats.turns} ${stats.turns === 1 ? 'turn' : 'turns'}`
}

function AwardList({ awards, stats }: { awards: Award[]; stats: PlayerStats[] }) {
  const headingId = React.useId()
  const players = new Map(stats.map((s) => [s.playerId, s]))
  // Two to a row on a phone: with an odd count the first one, usually MVP,
  // takes a whole row rather than leaving a gap at the end
  const widenFirst = awards.length % 2 === 1

  return (
    <section aria-labelledby={headingId} className="@container">
      <h2 id={headingId} className="mb-3 text-xs sm:text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Awards
      </h2>
      {awards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No awards this game: nobody reached the mark.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
          {awards.map((award, i) => {
            const player = players.get(award.playerId)
            return (
              <motion.li
                key={award.id}
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: FIRST_AWARD_DELAY_S + i * AWARD_STEP_S,
                  type: 'spring',
                  damping: 18,
                  stiffness: 220,
                }}
                className={cn(
                  'min-w-0 rounded-xl border p-3',
                  AWARD_TINT[award.id],
                  widenFirst && i === 0 && 'col-span-2 @xl:col-span-1'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {award.emoji}
                  </span>
                  <p className="min-w-0 text-sm font-bold leading-tight">{award.title}</p>
                </div>
                <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span aria-hidden="true">{player?.avatar}</span>
                  <span className="truncate">{player?.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">{award.detail}</p>
              </motion.li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const COLUMNS = [
  { key: 'pots', label: 'Potted', className: ACTION_STYLES.pot.text },
  { key: 'misses', label: 'Missed', className: ACTION_STYLES.miss.text },
  { key: 'blacks', label: 'Blacks', className: ACTION_STYLES.pot_black.text },
  { key: 'longestStreak', label: 'Streak', className: 'text-orange-600 dark:text-orange-400' },
] as const

/** Pots, misses, blacks and best streak per player, in finishing order */
export function GameStatsTable({ stats, className }: { stats: PlayerStats[]; className?: string }) {
  const headingId = React.useId()
  const decided = stats.some((s) => s.isWinner)

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="mb-3 text-xs sm:text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Match stats
      </h2>
      <Card className="overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b text-xs">
              <th scope="col" className="py-2 pl-3 pr-1 text-left font-medium text-muted-foreground">
                Player
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn('w-13 px-1 py-2 text-center font-semibold', column.className)}
                >
                  {column.key === 'longestStreak' ? (
                    <>
                      <span className="sr-only">Best </span>Streak
                    </>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortByStanding(stats).map((s) => (
              <tr key={s.playerId} className={cn('border-b last:border-0', s.isWinner && 'bg-emerald-500/5')}>
                <th scope="row" className="py-2 pl-3 pr-1 text-left font-normal">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xl leading-none" aria-hidden="true">
                      {s.avatar}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{s.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{standing(s, stats.length, decided)}</div>
                    </div>
                  </div>
                </th>
                {COLUMNS.map((column) => (
                  <td key={column.key} className="px-1 py-2 text-center font-semibold tabular-nums">
                    {s[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">Potted counts blacks too.</p>
      </Card>
    </section>
  )
}

export interface GameAwardsProps {
  game: Game
  className?: string
}

/**
 * The end-of-game block, on the winner screen and in a game's history:
 * awards for a completed game, then the match stats. An abandoned game gets
 * the stats alone; it was never decided, so nobody gets an award.
 */
export function GameAwards({ game, className }: GameAwardsProps) {
  const stats = getPlayerStats(game)
  const awards = computeAwards(game)
  const showAwards = game.status === 'completed'

  if (!showAwards && game.history.length === 0) return null

  return (
    <div className={cn('space-y-6 text-left', className)}>
      {showAwards && <AwardList awards={awards} stats={stats} />}
      {game.history.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: showAwards ? FIRST_AWARD_DELAY_S + awards.length * AWARD_STEP_S : 0 }}
        >
          <GameStatsTable stats={stats} />
        </motion.div>
      )}
    </div>
  )
}
