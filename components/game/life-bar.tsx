'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export interface LifeBarProps {
  lives: number
  maxLives?: number
  animated?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LifeBar({
  lives,
  maxLives = 10,
  animated = true,
  size = 'md',
  className,
}: LifeBarProps) {
  const percentage = Math.min((lives / maxLives) * 100, 100)
  
  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  }

  // Color based on lives remaining
  const getColor = () => {
    if (lives <= 0) return 'bg-destructive'
    if (lives === 1) return 'bg-orange-500'
    if (lives === 2) return 'bg-yellow-500'
    return 'bg-emerald-500'
  }

  const getShadowColor = () => {
    if (lives <= 0) return 'shadow-destructive/50'
    if (lives === 1) return 'shadow-orange-500/50'
    if (lives === 2) return 'shadow-yellow-500/50'
    return 'shadow-emerald-500/50'
  }

  return (
    <div className={cn('relative w-full rounded-full overflow-hidden bg-muted', sizeClasses[size], className)}>
      {animated ? (
        <motion.div
          className={cn('h-full rounded-full shadow-lg', getColor(), getShadowColor())}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: 0.5,
            ease: 'easeOut',
          }}
        />
      ) : (
        <div
          className={cn('h-full rounded-full shadow-lg', getColor(), getShadowColor())}
          style={{ width: `${percentage}%` }}
        />
      )}
      
      {/* Shine effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  )
}
