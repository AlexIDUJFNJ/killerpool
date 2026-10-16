'use client'

import { Heart, Swords } from 'lucide-react'
import type { Game, Player } from '@/lib/types'
import { isFinalDuel } from '@/lib/commentary'

/**
 * A slim strip under the game screen's header for as long as the final duel
 * lasts. Read from the game itself rather than from the shot that started the
 * duel, so it is there after a reload and for a spectator who joins mid-duel.
 */
export function FinalDuelStrip({ game }: { game: Game }) {
  if (!isFinalDuel(game)) return null
  const [first, second] = game.players.filter((p) => !p.eliminated)

  return (
    <div className="border-t border-red-500/25 bg-linear-to-r from-red-500/10 via-amber-500/10 to-red-500/10 px-4 py-1.5">
      <p className="flex items-center justify-center gap-2 text-xs">
        <Swords className="h-3.5 w-3.5 shrink-0 text-red-500 motion-safe:animate-pulse" aria-hidden="true" />
        <span className="font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Final duel</span>
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground/80">
          <Duellist player={first} />
          <span className="text-muted-foreground">vs</span>
          <Duellist player={second} />
        </span>
      </p>
    </div>
  )
}

function Duellist({ player }: { player: Player }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{player.name}</span>
      <Heart
        className={player.lives === 1 ? 'h-3 w-3 shrink-0 fill-red-500 text-red-500' : 'h-3 w-3 shrink-0 fill-emerald-500 text-emerald-500'}
        aria-hidden="true"
      />
      <span className="tabular-nums">
        {player.lives}
        <span className="sr-only"> {player.lives === 1 ? 'life' : 'lives'}</span>
      </span>
    </span>
  )
}
