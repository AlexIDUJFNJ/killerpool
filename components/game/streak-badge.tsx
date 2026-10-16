import { cn } from '@/lib/utils'
import { ON_FIRE_STREAK, STREAK_BADGE_MIN } from '@/lib/game-insights'

export interface StreakBadgeProps {
  /** Pots in a row, see getCurrentStreak */
  streak: number
  /** 'sm' for player lists: the count alone, without the "On fire" label */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Classes for the card of a player who is on fire: an orange border and
 * shadow, and a slow glow on top of them. The glow (the on-fire animation in
 * app/globals.css) is motion-safe only, so with "reduce motion" the card
 * keeps the static highlight and nothing pulses.
 */
export const ON_FIRE_CARD = 'border-orange-500/60 shadow-orange-500/30 motion-safe:animate-on-fire'

export function isOnFire(streak: number): boolean {
  return streak >= ON_FIRE_STREAK
}

/** What a screen reader hears for a streak, e.g. "On fire: 3 pots in a row" */
export function streakLabel(streak: number): string {
  return `${isOnFire(streak) ? 'On fire' : 'Streak'}: ${streak} pots in a row`
}

/**
 * "🔥 ×N" for a player with two pots in a row or more, and "🔥 ON FIRE ×N"
 * from three. Nothing below two: one pot is just a pot.
 */
export function StreakBadge({ streak, size = 'md', className }: StreakBadgeProps) {
  if (streak < STREAK_BADGE_MIN) return null
  const onFire = isOnFire(streak)

  return (
    <span
      role="img"
      aria-label={streakLabel(streak)}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-bold leading-none tabular-nums whitespace-nowrap',
        onFire
          ? 'border-orange-500/60 bg-orange-500/15 text-orange-700 dark:text-orange-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-3 py-1.5 text-sm',
        className
      )}
    >
      <span aria-hidden="true">🔥</span>
      {onFire && size === 'md' && <span className="uppercase tracking-wide">On fire</span>}
      <span>×{streak}</span>
    </span>
  )
}
