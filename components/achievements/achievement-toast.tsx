'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AchievementType } from '@/lib/types'
import { getAchievementDefinition, getRarityColor } from '@/lib/achievements'
import { cn } from '@/lib/utils'

interface AchievementToastProps {
  achievementType: AchievementType
  show: boolean
  onClose: () => void
}

export function AchievementToast({ achievementType, show, onClose }: AchievementToastProps) {
  const definition = getAchievementDefinition(achievementType)

  if (!definition) return null

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2"
        >
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border-2 bg-background px-4 py-3 shadow-lg',
              getRarityColor(definition.rarity)
            )}
            onClick={onClose}
          >
            <motion.div
              initial={{ rotate: -20, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className="text-3xl"
            >
              {definition.icon}
            </motion.div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Achievement Unlocked!
              </p>
              <p className="font-semibold">{definition.name}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface AchievementToastsProps {
  achievements: AchievementType[]
  onDismiss: () => void
}

export function AchievementToasts({ achievements, onDismiss }: AchievementToastsProps) {
  if (achievements.length === 0) return null

  // Show first achievement
  const currentAchievement = achievements[0]

  return (
    <AchievementToast
      achievementType={currentAchievement}
      show={true}
      onClose={onDismiss}
    />
  )
}
