'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'

export interface PlayerCardProps {
  id: string
  name: string
  avatar?: string
  lives: number
  eliminated?: boolean
  isActive?: boolean
  maxLives?: number
  className?: string
  variant?: 'default' | 'compact' | 'mini' | 'inline'
  showPosition?: number
}

// Color based on lives remaining - consistent across all variants
const getLifeColor = (lives: number) => {
  if (lives <= 0) return { bg: 'bg-destructive', border: 'border-destructive', shadow: 'shadow-destructive/50' }
  if (lives === 1) return { bg: 'bg-red-500', border: 'border-red-400', shadow: 'shadow-red-500/50' }
  if (lives === 2) return { bg: 'bg-yellow-500', border: 'border-yellow-400', shadow: 'shadow-yellow-500/50' }
  return { bg: 'bg-emerald-500', border: 'border-emerald-400', shadow: 'shadow-emerald-500/50' }
}

export function PlayerCard({
  name,
  avatar = '🎱',
  lives,
  eliminated = false,
  isActive = false,
  maxLives = 3,
  className,
  variant = 'default',
  showPosition,
}: PlayerCardProps) {
  const lifeColor = getLifeColor(lives)
  // Inline variant - ultra compact for sticky header
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <span className="text-2xl">{avatar}</span>
        <span className="font-bold text-lg">{name}&apos;s Turn</span>
        <div className="flex gap-0.5 ml-auto">
          {Array.from({ length: Math.min(lives, 5) }).map((_, i) => (
            <div key={i} className={cn('h-2 w-2 rounded-full', lifeColor.bg)} />
          ))}
          {lives > 5 && <span className="text-xs ml-1">+{lives - 5}</span>}
        </div>
      </div>
    )
  }

  // Mini variant - for "Next Up" preview
  if (variant === 'mini') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className={cn(
          'flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/30',
          className
        )}
      >
        <span className="text-muted-foreground text-sm">→</span>
        <span className="text-xl">{avatar}</span>
        <span className="font-medium flex-1">{name}</span>
        <div className="flex gap-0.5">
          {Array.from({ length: Math.min(lives, 5) }).map((_, i) => (
            <div key={i} className={cn('h-2 w-2 rounded-full', lifeColor.bg)} />
          ))}
          {lives > 5 && <span className="text-xs ml-1">+{lives - 5}</span>}
        </div>
      </motion.div>
    )
  }

  // Compact variant - for all players list
  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{
          opacity: eliminated ? 0.5 : 1,
          scale: 1
        }}
        transition={{ duration: 0.3 }}
        className={className}
      >
        <Card
          className={cn(
            'relative overflow-hidden transition-all',
            isActive && 'ring-2 ring-primary shadow-lg shadow-primary/20',
            eliminated && 'opacity-50 grayscale'
          )}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              {/* Position Number */}
              {showPosition !== undefined && (
                <div className="shrink-0 w-6 text-center">
                  <span className="text-sm font-bold text-muted-foreground">
                    {showPosition}.
                  </span>
                </div>
              )}

              {/* Avatar */}
              <Avatar className="h-10 w-10 border-2 border-primary/20">
                <AvatarFallback className="text-2xl bg-primary/10">
                  {avatar}
                </AvatarFallback>
              </Avatar>

              {/* Player Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base truncate">{name}</h3>
                  {isActive && (
                    <Badge variant="default" className="text-xs px-1.5 py-0">
                      Active
                    </Badge>
                  )}
                  {eliminated && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0">
                      Out
                    </Badge>
                  )}
                </div>
              </div>

              {/* Compact Lives Display */}
              <div className="flex gap-0.5">
                {Array.from({ length: Math.min(lives, 5) }).map((_, i) => (
                  <div
                    key={i}
                    className={cn('h-2.5 w-2.5 rounded-full border', lifeColor.bg, lifeColor.border)}
                  />
                ))}
                {lives > 5 && (
                  <Badge variant="secondary" className="text-xs px-1 ml-1">
                    +{lives - 5}
                  </Badge>
                )}
              </div>
            </div>

            {/* Active Indicator */}
            {isActive && (
              <motion.div
                className="absolute top-0 left-0 h-full w-1 bg-primary"
                layoutId="activeIndicator"
              />
            )}
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  // Default variant - original design
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: eliminated ? 0.5 : 1,
        scale: isActive ? 1.05 : 1
      }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Card
        className={cn(
          'relative overflow-hidden transition-all',
          isActive && 'ring-2 ring-primary shadow-lg shadow-primary/20',
          eliminated && 'opacity-50 grayscale'
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <Avatar className="h-16 w-16 border-2 border-primary/20">
              <AvatarFallback className="text-4xl bg-primary/10">
                {avatar}
              </AvatarFallback>
            </Avatar>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-lg truncate">{name}</h3>
                {isActive && (
                  <Badge variant="default" className="text-xs">
                    Active
                  </Badge>
                )}
                {eliminated && (
                  <Badge variant="destructive" className="text-xs">
                    Out
                  </Badge>
                )}
              </div>

              {/* Lives Display */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Lives:</span>
                <div className="flex gap-1">
                  {Array.from({ length: maxLives }).map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className={cn(
                        'h-6 w-6 rounded-full border-2',
                        i < lives
                          ? `${lifeColor.bg} ${lifeColor.border} shadow-lg ${lifeColor.shadow}`
                          : 'bg-background border-muted'
                      )}
                    />
                  ))}
                  {lives > maxLives && (
                    <Badge variant="secondary" className="ml-2">
                      +{lives - maxLives}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Active Indicator */}
          {isActive && (
            <motion.div
              className="absolute top-0 left-0 h-full w-1 bg-primary"
              layoutId="activeIndicator"
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
