'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { CommentaryQueue } from '@/lib/commentary-queue'
import type { CommentaryKind, DuelPlayer } from '@/lib/commentary'
import { cn } from '@/lib/utils'

const KIND_ICONS: Record<CommentaryKind, string> = {
  victory: '🏆',
  final_duel: '⚔️',
  eliminated: '💀',
  black_on_last_life: '🎱',
  comeback: '🧟',
  streak_broken: '🧊',
  last_life: '😬',
  unstoppable: '☄️',
  blazing: '🔥',
  on_fire: '🔥',
}

function useStage(queue: CommentaryQueue) {
  return React.useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot)
}

/**
 * The commentator's line, one at a time. Never in the way: it ignores the
 * pointer, and the caller places it clear of the shot buttons.
 *
 * The live region is rendered even when there is no line — screen readers
 * only announce changes inside a region they already know about.
 */
export function CommentaryBanner({ queue, className }: { queue: CommentaryQueue; className?: string }) {
  const { line } = useStage(queue)

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={cn('pointer-events-none flex justify-center px-4', className)}
    >
      <AnimatePresence mode="wait">
        {line && (
          <motion.div
            key={line.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className={cn(
              'flex max-w-md items-center gap-2.5 rounded-2xl border px-4 py-2.5 shadow-lg backdrop-blur-md',
              'border-amber-500/30 bg-background/90 text-sm font-semibold leading-snug sm:text-base'
            )}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {KIND_ICONS[line.kind]}
            </span>
            <span>{line.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * "FINAL DUEL", the two names and their lives, for the two seconds after the
 * shot that left two players. Purely visual — the commentator's line says
 * the same for screen readers once it is gone.
 */
export function DuelOverlay({ queue }: { queue: CommentaryQueue }) {
  const { duel } = useStage(queue)

  return <AnimatePresence>{duel && <DuelCard key={duel.id} players={duel.players} />}</AnimatePresence>
}

function DuelCard({ players }: { players: DuelPlayer[] }) {
  const [first, second] = players

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/75 backdrop-blur-sm pointer-events-none select-none"
      aria-hidden="true"
      data-testid="final-duel-overlay"
    >
      {/* A red flash on the way in. Not with "reduce motion": opacity is
          left to play there (see components/motion-provider.tsx), and a
          full-screen flash is what that setting asks to avoid. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.35, 0] }}
        transition={{ duration: 0.5, times: [0, 0.2, 1] }}
        className="absolute inset-0 bg-red-600 motion-reduce:hidden"
      />

      {/* Slams in with a short shake. Both are transforms, which
          MotionConfig skips under "reduce motion": the card simply fades in. */}
      <motion.div
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, x: [0, -8, 8, -5, 5, 0] }}
        transition={{
          scale: { type: 'spring', damping: 14, stiffness: 260 },
          opacity: { duration: 0.15 },
          x: { delay: 0.18, duration: 0.35 },
        }}
        className="relative flex w-full max-w-md flex-col items-center gap-5 px-6 text-center"
      >
        <span className="text-5xl leading-none">⚔️</span>
        <h2 className="bg-linear-to-b from-amber-300 via-red-500 to-red-700 bg-clip-text text-5xl font-black tracking-[0.12em] text-transparent sm:text-7xl">
          FINAL DUEL
        </h2>
        <div className="flex w-full items-center justify-center gap-3 sm:gap-6">
          {first && <Duellist player={first} />}
          <span className="text-xl font-black text-white/60 sm:text-2xl">VS</span>
          {second && <Duellist player={second} />}
        </div>
      </motion.div>
    </motion.div>
  )
}

function Duellist({ player }: { player: DuelPlayer }) {
  const onLastLife = player.lives === 1

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <span className="text-4xl leading-none sm:text-5xl">{player.avatar}</span>
      <span className="max-w-full truncate text-lg font-bold text-white sm:text-xl">{player.name}</span>
      <span
        className={cn(
          'rounded-full px-2.5 py-0.5 text-xs font-semibold',
          onLastLife ? 'bg-red-500/25 text-red-200' : 'bg-emerald-500/20 text-emerald-200'
        )}
      >
        {player.lives} {player.lives === 1 ? 'life' : 'lives'}
      </span>
    </div>
  )
}
