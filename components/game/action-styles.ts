import { X, Circle, Target, type LucideIcon } from 'lucide-react'
import type { GameAction } from '@/lib/types'

/**
 * How each shot looks, everywhere it appears: the home-screen rules, the
 * swipe card, the history timeline, stats and help.
 *
 * The colour follows what the shot does to a player's lives — red loses one,
 * neutral slate changes nothing, emerald gains one — the same green as the
 * lives themselves. Before this, POT and BLACK swapped colours between
 * screens (slate/emerald on the home page, emerald/slate on the card,
 * yellow/green in history and help).
 *
 * Text colours are one step darker in the light theme so they stay readable
 * on white.
 */
export interface ActionStyle {
  /** Short label used on buttons and badges */
  label: string
  /** Name as the rules call it */
  name: string
  icon: LucideIcon
  /** Foreground colour for icons and labels */
  text: string
  /** Tinted background and border for chips, rows and badges */
  surface: string
  /** Solid border, for the badge shown while a swipe is in progress */
  border: string
}

export const ACTION_STYLES: Record<GameAction, ActionStyle> = {
  miss: {
    label: 'Miss',
    name: 'MISS',
    icon: X,
    text: 'text-red-600 dark:text-red-400',
    surface: 'bg-red-500/10 border-red-500/30',
    border: 'border-red-500',
  },
  pot: {
    label: 'Pot',
    name: 'POT',
    icon: Circle,
    text: 'text-slate-600 dark:text-slate-300',
    surface: 'bg-slate-500/10 border-slate-500/30',
    border: 'border-slate-500',
  },
  pot_black: {
    label: 'Black',
    name: 'POT BLACK',
    icon: Target,
    text: 'text-emerald-600 dark:text-emerald-400',
    surface: 'bg-emerald-500/10 border-emerald-500/30',
    border: 'border-emerald-500',
  },
}

/** Lives change as shown to players, e.g. "-1", "0", "+1" */
export function formatLivesDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta)
}
