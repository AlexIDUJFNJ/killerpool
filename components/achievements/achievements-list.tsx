'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ACHIEVEMENTS } from '@/lib/types'
import {
  getUserAchievements,
  getAchievementProgress,
  getTotalAchievementCount,
  UnlockedAchievement,
} from '@/lib/achievements'
import { AchievementCard } from './achievement-card'

interface AchievementsListProps {
  userId: string
}

export function AchievementsList({ userId }: AchievementsListProps) {
  const [achievements, setAchievements] = useState<UnlockedAchievement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAchievements() {
      const data = await getUserAchievements(userId)
      setAchievements(data)
      setLoading(false)
    }

    loadAchievements()
  }, [userId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const unlockedTypes = new Set(achievements.map(a => a.definition.id))
  const progress = getAchievementProgress(achievements.length)
  const total = getTotalAchievementCount()

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">
            {achievements.length}/{total} ({progress}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full rounded-full bg-primary"
          />
        </div>
      </div>

      {/* Achievements grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ACHIEVEMENTS.map((definition, index) => {
          const unlocked = unlockedTypes.has(definition.id)
          const unlockedAchievement = achievements.find(
            a => a.definition.id === definition.id
          )

          return (
            <motion.div
              key={definition.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <AchievementCard
                definition={definition}
                unlocked={unlocked}
                unlockedAt={unlockedAchievement?.unlockedAt}
              />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
