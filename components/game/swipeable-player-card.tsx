'use client'

import * as React from 'react'
import { motion, useMotionValue, useTransform, useIsPresent, PanInfo } from 'motion/react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptic'
import { ACTION_STYLES } from './action-styles'

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

const ACTION_HAPTICS: Record<SwipeAction, () => void> = {
  miss: haptics.miss,
  pot: haptics.pot,
  pot_black: haptics.potBlack,
}

/** Buttons in the same left / up / right order as the swipe directions */
const BUTTON_ORDER: SwipeAction[] = ['miss', 'pot_black', 'pot']

const ARROWS: Record<SwipeAction, string> = {
  miss: '←',
  pot_black: '↑',
  pot: '→',
}

const KEY_ACTIONS: Record<string, SwipeAction> = {
  ArrowLeft: 'miss',
  ArrowUp: 'pot_black',
  ArrowRight: 'pot',
}

const KEY_SHORTCUTS: Record<SwipeAction, string> = {
  miss: 'ArrowLeft',
  pot_black: 'ArrowUp',
  pot: 'ArrowRight',
}

type FocusTarget = SwipeAction | 'card'

/**
 * The game screen replaces this card after every shot (a new key per turn),
 * which drops keyboard focus onto <body>. The next card picks focus back up
 * from here, so a keyboard player can keep pressing the same control. Module
 * scope because the two cards are different instances; time-limited so a card
 * mounted much later never steals focus.
 */
let pendingFocus: { target: FocusTarget; at: number } | null = null
const FOCUS_HANDOFF_MS = 2000

export function SwipeablePlayerCard({
  name,
  avatar = '🎱',
  lives,
  maxLives = 6,
  onSwipe,
  disabled = false,
}: SwipeablePlayerCardProps) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [isDragging, setIsDragging] = React.useState(false)
  const [swipeDirection, setSwipeDirection] = React.useState<SwipeAction | null>(null)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const buttonRefs = React.useRef<Partial<Record<SwipeAction, HTMLButtonElement | null>>>({})
  const hintId = React.useId()

  // While the card animates out after a shot it is still on screen and still
  // clickable; acting on it then would record a second shot for this player
  const isPresent = useIsPresent()
  const inactive = disabled || !isPresent

  React.useEffect(() => {
    const handoff = pendingFocus
    pendingFocus = null
    if (!handoff || Date.now() - handoff.at > FOCUS_HANDOFF_MS) return

    const active = document.activeElement
    if (active && active !== document.body) return

    const target =
      handoff.target === 'card' ? cardRef.current : buttonRefs.current[handoff.target]
    target?.focus({ preventScroll: true })
  }, [])

  // Visual feedback during drag
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15])
  const opacity = useTransform(
    x,
    [-200, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, 200],
    [0.5, 1, 1, 1, 0.5]
  )

  // Indicator opacities
  const missOpacity = useTransform(x, [-200, -SWIPE_THRESHOLD, 0], [1, 0.7, 0])
  const potOpacity = useTransform(x, [0, SWIPE_THRESHOLD, 200], [0, 0.7, 1])
  const blackOpacity = useTransform(y, [-200, -SWIPE_THRESHOLD, 0], [1, 0.7, 0])

  /** The one way a shot leaves this card — swipe, button or key alike */
  const play = (action: SwipeAction) => {
    if (inactive) return

    const active = document.activeElement
    const focusTarget: FocusTarget | null =
      active === cardRef.current
        ? 'card'
        : BUTTON_ORDER.find((a) => buttonRefs.current[a] === active) ?? null
    pendingFocus = focusTarget ? { target: focusTarget, at: Date.now() } : null

    ACTION_HAPTICS[action]()
    onSwipe(action)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const action = KEY_ACTIONS[event.key]
    if (!action || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    play(action)
  }

  const handleDragStart = () => {
    if (inactive) return
    setIsDragging(true)
    haptics.swipeStart()
  }

  const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (inactive) return

    const currentX = info.offset.x
    const currentY = info.offset.y

    // Determine swipe direction
    if (Math.abs(currentX) > Math.abs(currentY)) {
      // Horizontal swipe
      if (currentX < -SWIPE_THRESHOLD / 2) {
        setSwipeDirection('miss')
      } else if (currentX > SWIPE_THRESHOLD / 2) {
        setSwipeDirection('pot')
      } else {
        setSwipeDirection(null)
      }
    } else {
      // Vertical swipe (up)
      if (currentY < -SWIPE_THRESHOLD / 2) {
        setSwipeDirection('pot_black')
      } else {
        setSwipeDirection(null)
      }
    }
  }

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false)
    setSwipeDirection(null)
    if (inactive) return

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
      }
      // Right swipe (POT)
      else if (offsetX > SWIPE_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD) {
        action = 'pot'
      }
    }
    // Check vertical swipe (up for BLACK)
    else if (offsetY < -SWIPE_THRESHOLD || velocityY < -SWIPE_VELOCITY_THRESHOLD) {
      action = 'pot_black'
    }

    if (action) {
      play(action)
    }
  }

  const livesLabel = `${lives} ${lives === 1 ? 'life' : 'lives'} remaining`

  return (
    <div className="w-full max-w-md mx-auto" onKeyDown={handleKeyDown}>
      <div className="relative">
        {/* Swipe Indicators */}
        {(
          [
            ['miss', missOpacity, 'left-0 top-1/2 -translate-y-1/2 -translate-x-24'],
            ['pot_black', blackOpacity, 'left-1/2 -translate-x-1/2 top-0 -translate-y-24'],
            ['pot', potOpacity, 'right-0 top-1/2 -translate-y-1/2 translate-x-24'],
          ] as const
        ).map(([action, indicatorOpacity, position]) => {
          const style = ACTION_STYLES[action]
          const Icon = style.icon
          return (
            <motion.div
              key={action}
              style={{ opacity: indicatorOpacity }}
              className={cn('absolute z-0', position)}
              aria-hidden="true"
            >
              <div className={cn('flex flex-col items-center gap-2', style.text)}>
                <Icon className="h-16 w-16" strokeWidth={3} />
                <span className="text-xl font-bold">{style.label.toUpperCase()}</span>
              </div>
            </motion.div>
          )
        })}

        {/* Swipeable Card */}
        <motion.div
          ref={cardRef}
          role="group"
          aria-label={`${name}, ${livesLabel}`}
          aria-describedby={hintId}
          tabIndex={inactive ? -1 : 0}
          drag={!inactive}
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.7}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          style={{ x, y, rotate, opacity }}
          className={cn(
            'relative z-10 cursor-grab active:cursor-grabbing rounded-xl',
            'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <Card className="overflow-hidden border-2 border-primary/20 shadow-2xl">
            <CardContent className="p-0">
              {/* Card Content */}
              <div className="relative bg-linear-to-br from-background via-background to-primary/5 p-6 sm:p-8">
                {/* Active Indicator */}
                {swipeDirection && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn('absolute top-4 right-4', ACTION_STYLES[swipeDirection].text)}
                    aria-hidden="true"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-lg px-3 py-1 border-2',
                        ACTION_STYLES[swipeDirection].surface,
                        ACTION_STYLES[swipeDirection].border
                      )}
                    >
                      {ACTION_STYLES[swipeDirection].label.toUpperCase()}
                    </Badge>
                  </motion.div>
                )}

                {/* Avatar */}
                <div className="flex justify-center mb-4 sm:mb-6" aria-hidden="true">
                  <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-primary/30 shadow-xl">
                    <AvatarFallback className="text-6xl sm:text-8xl bg-primary/10">
                      {avatar}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Player Name */}
                <h2 className="text-2xl sm:text-4xl font-bold text-center mb-6 sm:mb-8">
                  {name}
                </h2>

                {/* Lives Display */}
                <div className="space-y-2 sm:space-y-3">
                  <p className="text-xs sm:text-sm text-muted-foreground text-center uppercase tracking-wide">
                    Lives Remaining
                  </p>
                  <div className="flex justify-center gap-2 sm:gap-3" aria-hidden="true">
                    {Array.from({ length: maxLives }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: i < lives ? 1 : 0.5 }}
                        transition={{ delay: i * 0.1 }}
                        className={cn(
                          'h-8 w-8 sm:h-12 sm:w-12 rounded-full border-2 sm:border-4 transition-all',
                          i < lives
                            ? lives === 1
                              ? 'bg-red-500 border-red-400 shadow-lg shadow-red-500/50'
                              : 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/50'
                            : 'bg-muted border-muted-foreground/20'
                        )}
                      />
                    ))}
                    {lives > maxLives && (
                      <Badge variant="secondary" className="text-lg sm:text-2xl px-3 sm:px-4 py-1.5 sm:py-2 ml-2">
                        +{lives - maxLives}
                      </Badge>
                    )}
                  </div>
                  <p className="text-4xl sm:text-6xl font-bold text-center text-primary mt-3 sm:mt-4">
                    {lives}
                  </p>
                </div>
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

      {/* The same three shots without a swipe: for keyboards, switch access,
          screen readers, and anyone who simply prefers to tap */}
      <div className="mt-6 sm:mt-8">
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center uppercase tracking-widest mb-2 sm:mb-3">
          Swipe or tap to play
        </p>
        <p id={hintId} className="sr-only">
          Use the buttons below, or the arrow keys: left for Miss, up for Black, right for Pot.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {BUTTON_ORDER.map((action) => {
            const style = ACTION_STYLES[action]
            const Icon = style.icon
            return (
              <Button
                key={action}
                ref={(node) => {
                  buttonRefs.current[action] = node
                }}
                type="button"
                variant="outline"
                disabled={inactive}
                onClick={() => play(action)}
                aria-keyshortcuts={KEY_SHORTCUTS[action]}
                className={cn('h-14 flex-col gap-0.5 px-2 border', style.surface)}
              >
                <Icon className={cn('h-5 w-5', style.text)} />
                {/* Arrow on the side it points to, as in "← Miss" and "Pot →" */}
                <span className="text-xs sm:text-sm font-semibold">
                  {action !== 'pot' && <span aria-hidden="true">{ARROWS[action]} </span>}
                  {style.label}
                  {action === 'pot' && <span aria-hidden="true"> {ARROWS[action]}</span>}
                </span>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
