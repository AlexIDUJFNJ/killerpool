'use client'

import { MotionConfig } from 'motion/react'

/**
 * Honours the operating system's "reduce motion" setting for every motion
 * component in the app: transform and layout animations (slides, scales,
 * spins, the card flip between turns) are skipped, while opacity and colour
 * changes still play, so state changes stay visible without movement.
 *
 * Effects that move things through other properties — the black-ball
 * celebration animates position — check useReducedMotion themselves.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
