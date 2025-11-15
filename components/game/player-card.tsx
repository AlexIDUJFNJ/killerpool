'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export interface PlayerCardProps {
  id: string
  name: string
  avatar?: string
  lives: number
  eliminated?: boolean
  isActive?: boolean
  maxLives?: number
  className?: string
}

export function PlayerCard({
  name,
  avatar = '🎱',
  lives,
  eliminated = false,
  isActive = false,
  maxLives = 3,
  className,
}: PlayerCardProps) {
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
                          ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/50'
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
