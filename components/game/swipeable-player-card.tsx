'use client'

import * as React from 'react'
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptic'
import { X, Circle, Target } from 'lucide-react'

export type SwipeAction = 'miss' | 'pot' | 'pot_black'

export interface SwipeablePlayerCardProps {
  name: string
  avatar?: string
  lives: number
  maxLives?: number
  onSwipe: (action: SwipeAction) => void
  disabled?: boolean
}

const SWIPE_THRESHOLD = 100
const SWIPE_VELOCITY_THRESHOLD = 500

export function SwipeablePlayerCard({
  name,
  avatar = '🎱',
  lives,
  maxLives = 3,
  onSwipe,
  disabled = false,
}: SwipeablePlayerCardProps) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [isDragging, setIsDragging] = React.useState(false)
  const [swipeDirection, setSwipeDirection] = React.useState<SwipeAction | null>(null)

  // Visual feedback during drag
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15])
  const opacity = useTransform(
    x,
    [-200, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, 200],
    [0.5, 1, 1, 1, 0.5]
  )

  // Indicator opacities
  const missOpacity = useTransform(x, [-200, -SWIPE_THRESHOLD, 0], [1, 0.7, 0])
  const potOpacity = useTransform(y, [-200, -SWIPE_THRESHOLD, 0], [1, 0.7, 0])
  const blackOpacity = useTransform(x, [0, SWIPE_THRESHOLD, 200], [0, 0.7, 1])

  const handleDragStart = () => {
    if (disabled) return
    setIsDragging(true)
    haptics.swipeStart()
  }

  const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (disabled) return

    const currentX = info.offset.x
    const currentY = info.offset.y

    // Determine swipe direction
    if (Math.abs(currentX) > Math.abs(currentY)) {
      // Horizontal swipe
      if (currentX < -SWIPE_THRESHOLD / 2) {
        setSwipeDirection('miss')
      } else if (currentX > SWIPE_THRESHOLD / 2) {
        setSwipeDirection('pot_black')
      } else {
        setSwipeDirection(null)
      }
    } else {
      // Vertical swipe (up)
      if (currentY < -SWIPE_THRESHOLD / 2) {
        setSwipeDirection('pot')
      } else {
        setSwipeDirection(null)
      }
    }
  }

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (disabled) {
      setIsDragging(false)
      return
    }

    const offsetX = info.offset.x
    const offsetY = info.offset.y
    const velocityX = info.velocity.x
    const velocityY = info.velocity.y

    let action: SwipeAction | null = null

    // Check horizontal swipes first
    if (Math.abs(offsetX) > Math.abs(offsetY)) {
      // Left swipe (MISS)
      if (offsetX < -SWIPE_THRESHOLD || velocityX < -SWIPE_VELOCITY_THRESHOLD) {
        action = 'miss'
        haptics.miss()
      }
      // Right swipe (POT BLACK)
      else if (offsetX > SWIPE_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD) {
        action = 'pot_black'
        haptics.potBlack()
      }
    }
    // Check vertical swipe (up for POT)
    else if (offsetY < -SWIPE_THRESHOLD || velocityY < -SWIPE_VELOCITY_THRESHOLD) {
      action = 'pot'
      haptics.pot()
    }

    if (action) {
      onSwipe(action)
    }

    // Reset
    setIsDragging(false)
    setSwipeDirection(null)
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Swipe Indicators */}
      <motion.div
        style={{ opacity: missOpacity }}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-24 z-0"
      >
        <div className="flex flex-col items-center gap-2 text-red-500">
          <X className="h-16 w-16" strokeWidth={3} />
          <span className="text-xl font-bold">MISS</span>
        </div>
      </motion.div>

      <motion.div
        style={{ opacity: potOpacity }}
        className="absolute left-1/2 -translate-x-1/2 top-0 -translate-y-24 z-0"
      >
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <Circle className="h-16 w-16" strokeWidth={3} />
          <span className="text-xl font-bold">POT</span>
        </div>
      </motion.div>

      <motion.div
        style={{ opacity: blackOpacity }}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-24 z-0"
      >
        <div className="flex flex-col items-center gap-2 text-emerald-500">
          <Target className="h-16 w-16" strokeWidth={3} />
          <span className="text-xl font-bold">BLACK</span>
        </div>
      </motion.div>

      {/* Swipeable Card */}
      <motion.div
        drag={!disabled}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.7}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x, y, rotate, opacity }}
        className={cn(
          'relative z-10 cursor-grab active:cursor-grabbing',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Card className="overflow-hidden border-2 border-primary/20 shadow-2xl">
          <CardContent className="p-0">
            {/* Card Content */}
            <div className="relative bg-gradient-to-br from-background via-background to-primary/5 p-8">
              {/* Active Indicator */}
              {swipeDirection && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    'absolute top-4 right-4',
                    swipeDirection === 'miss' && 'text-red-500',
                    swipeDirection === 'pot' && 'text-slate-400',
                    swipeDirection === 'pot_black' && 'text-emerald-500'
                  )}
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-lg px-3 py-1 border-2',
                      swipeDirection === 'miss' && 'border-red-500 bg-red-500/10',
                      swipeDirection === 'pot' && 'border-slate-400 bg-slate-400/10',
                      swipeDirection === 'pot_black' && 'border-emerald-500 bg-emerald-500/10'
                    )}
                  >
                    {swipeDirection === 'miss' && 'MISS'}
                    {swipeDirection === 'pot' && 'POT'}
                    {swipeDirection === 'pot_black' && 'BLACK'}
                  </Badge>
                </motion.div>
              )}

              {/* Avatar */}
              <div className="flex justify-center mb-6">
                <Avatar className="h-32 w-32 border-4 border-primary/30 shadow-xl">
                  <AvatarFallback className="text-8xl bg-primary/10">
                    {avatar}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Player Name */}
              <h2 className="text-4xl font-bold text-center mb-8">
                {name}
              </h2>

              {/* Lives Display */}
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center uppercase tracking-wide">
                  Lives Remaining
                </p>
                <div className="flex justify-center gap-3">
                  {Array.from({ length: maxLives }).map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: i < lives ? 1 : 0.5 }}
                      transition={{ delay: i * 0.1 }}
                      className={cn(
                        'h-12 w-12 rounded-full border-4 transition-all',
                        i < lives
                          ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/50'
                          : 'bg-muted border-muted-foreground/20'
                      )}
                    />
                  ))}
                  {lives > maxLives && (
                    <Badge variant="secondary" className="text-2xl px-4 py-2 ml-2">
                      +{lives - maxLives}
                    </Badge>
                  )}
                </div>
                <p className="text-6xl font-bold text-center text-primary mt-4">
                  {lives}
                </p>
              </div>

              {/* Swipe Instructions */}
              {!isDragging && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-8 pt-6 border-t border-border"
                >
                  <p className="text-xs text-muted-foreground text-center uppercase tracking-widest mb-3">
                    Swipe to play
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-red-500">
                        <X className="h-5 w-5 mx-auto" />
                      </div>
                      <span className="text-muted-foreground">← Miss</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-slate-400">
                        <Circle className="h-5 w-5 mx-auto" />
                      </div>
                      <span className="text-muted-foreground">↑ Pot</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-emerald-500">
                        <Target className="h-5 w-5 mx-auto" />
                      </div>
                      <span className="text-muted-foreground">Black →</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Drag hint overlay */}
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.1 }}
          className="absolute inset-0 bg-primary rounded-lg pointer-events-none"
        />
      )}
    </div>
  )
}
