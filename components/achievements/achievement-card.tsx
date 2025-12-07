'use client'

import { motion } from 'framer-motion'
import { AchievementDefinition } from '@/lib/types'
import { getRarityColor, getRarityBgColor, formatUnlockDate } from '@/lib/achievements'
import { cn } from '@/lib/utils'

interface AchievementCardProps {
  definition: AchievementDefinition
  unlocked?: boolean
  unlockedAt?: Date
  showDate?: boolean
}

export function AchievementCard({
  definition,
  unlocked = false,
  unlockedAt,
  showDate = true,
}: AchievementCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      className={cn(
        'relative rounded-xl border p-4 transition-colors',
        unlocked
          ? cn(getRarityBgColor(definition.rarity), getRarityColor(definition.rarity))
          : 'border-muted bg-muted/30 opacity-50'
      )}
    >
      {/* Rarity indicator */}
      {unlocked && (
        <div
          className={cn(
            'absolute top-2 right-2 text-xs font-medium uppercase',
            getRarityColor(definition.rarity)
          )}
        >
          {definition.rarity}
        </div>
      )}

      {/* Icon */}
      <div className="mb-3 text-4xl">{definition.icon}</div>

      {/* Title */}
      <h3
        className={cn(
          'font-semibold',
          unlocked ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {definition.name}
      </h3>

      {/* Description */}
      <p
        className={cn(
          'mt-1 text-sm',
          unlocked ? 'text-muted-foreground' : 'text-muted-foreground/70'
        )}
      >
        {definition.description}
      </p>

      {/* Unlock date */}
      {unlocked && unlockedAt && showDate && (
        <p className="mt-2 text-xs text-muted-foreground">
          Unlocked {formatUnlockDate(unlockedAt)}
        </p>
      )}

      {/* Locked overlay */}
      {!unlocked && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/50">
          <span className="text-2xl">🔒</span>
        </div>
      )}
    </motion.div>
  )
}
