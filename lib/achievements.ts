/**
 * Achievements system for Killerpool
 *
 * Functions for checking, granting, and displaying achievements.
 */

import { createClient } from '@/lib/supabase/client'
import { AchievementType, ACHIEVEMENTS, AchievementDefinition, Game } from './types'

interface DbAchievement {
  id: string
  user_id: string
  achievement_type: string
  unlocked_at: string
  game_id: string | null
}

export interface UnlockedAchievement {
  id: string
  definition: AchievementDefinition
  unlockedAt: Date
  gameId?: string
}

/**
 * Get all achievements for a user
 */
export async function getUserAchievements(userId: string): Promise<UnlockedAchievement[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false })

  if (error) {
    console.error('Error fetching achievements:', error)
    return []
  }

  const result: UnlockedAchievement[] = []

  for (const achievement of data as DbAchievement[]) {
    const definition = ACHIEVEMENTS.find(a => a.id === achievement.achievement_type)
    if (definition) {
      result.push({
        id: achievement.id,
        definition,
        unlockedAt: new Date(achievement.unlocked_at),
        gameId: achievement.game_id || undefined,
      })
    }
  }

  return result
}

/**
 * Check and grant achievements after game completion
 */
export async function checkAchievements(userId: string, gameId: string): Promise<AchievementType[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .rpc('check_achievements', {
      p_user_id: userId,
      p_game_id: gameId,
    })

  if (error) {
    console.error('Error checking achievements:', error)
    return []
  }

  // Return only newly unlocked achievements
  return (data || [])
    .filter((row: { is_new: boolean }) => row.is_new)
    .map((row: { achievement_type: AchievementType }) => row.achievement_type)
}

/**
 * Check achievements locally (without database)
 * Useful for showing potential achievements before sync
 */
export function checkLocalAchievements(game: Game, userId: string): AchievementType[] {
  const newAchievements: AchievementType[] = []

  // Find winner
  const winner = game.players.find(p => p.id === game.winnerId)
  if (!winner || winner.userId !== userId) {
    return newAchievements
  }

  // Check survivor (win with 1 life)
  if (winner.lives === 1) {
    newAchievements.push('survivor')
  }

  // Check perfect game (no lives lost)
  const startingLives = game.ruleset.params.starting_lives
  if (winner.lives >= startingLives) {
    newAchievements.push('perfect_game')
  }

  // Check pot_black_master
  const winnerHistory = game.history.filter(h => h.playerId === winner.id)
  const potBlacks = winnerHistory.filter(h => h.action === 'pot_black').length
  if (potBlacks >= 5) {
    newAchievements.push('pot_black_master')
  }

  return newAchievements
}

/**
 * Get achievement definition by type
 */
export function getAchievementDefinition(type: AchievementType): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find(a => a.id === type)
}

/**
 * Get rarity color for achievement
 */
export function getRarityColor(rarity: AchievementDefinition['rarity']): string {
  switch (rarity) {
    case 'common':
      return 'text-gray-400 border-gray-400'
    case 'rare':
      return 'text-blue-400 border-blue-400'
    case 'epic':
      return 'text-purple-400 border-purple-400'
    case 'legendary':
      return 'text-yellow-400 border-yellow-400'
  }
}

/**
 * Get rarity background color for achievement
 */
export function getRarityBgColor(rarity: AchievementDefinition['rarity']): string {
  switch (rarity) {
    case 'common':
      return 'bg-gray-400/10'
    case 'rare':
      return 'bg-blue-400/10'
    case 'epic':
      return 'bg-purple-400/10'
    case 'legendary':
      return 'bg-yellow-400/10'
  }
}

/**
 * Format achievement unlock date
 */
export function formatUnlockDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/**
 * Get total achievement count
 */
export function getTotalAchievementCount(): number {
  return ACHIEVEMENTS.length
}

/**
 * Calculate achievement progress percentage
 */
export function getAchievementProgress(unlockedCount: number): number {
  return Math.round((unlockedCount / ACHIEVEMENTS.length) * 100)
}
