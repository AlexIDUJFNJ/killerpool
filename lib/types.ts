/**
 * Game Types for Killerpool
 * 
 * Core TypeScript types for game logic, players, and actions.
 */

export type GameAction = 'miss' | 'pot' | 'pot_black'
export type GameStatus = 'setup' | 'active' | 'completed' | 'abandoned'

/**
 * Player in a game
 */
export interface Player {
  id: string
  name: string
  avatar: string
  lives: number
  eliminated: boolean
  userId?: string | null
}

/**
 * Ruleset parameters
 */
export interface Ruleset {
  id: string
  name: string
  description?: string
  params: {
    starting_lives: number
    miss: number           // -1
    pot: number            // 0
    pot_black: number      // +1
    max_lives?: number     // 6
  }
  is_default: boolean
}

/**
 * Game history entry
 */
export interface GameHistoryEntry {
  id: string
  action: GameAction
  playerId: string
  playerName: string
  timestamp: string
  livesBefore: number
  livesAfter: number
}

/**
 * Game state
 */
export interface Game {
  id: string
  createdAt: string
  updatedAt: string
  status: GameStatus
  players: Player[]
  currentPlayerIndex: number
  winnerId?: string | null
  rulesetId?: string
  ruleset: Ruleset
  history: GameHistoryEntry[]
  createdBy?: string | null
}

/**
 * New game form data
 */
export interface NewGameFormData {
  players: Array<{
    name: string
    avatar: string
  }>
  rulesetId?: string
}

/**
 * Game stats
 */
export interface GameStats {
  totalActions: number
  totalMisses: number
  totalPots: number
  totalBlackPots: number
  duration?: number
  winner?: Player
}

/**
 * Default ruleset for Classic Killer Pool
 */
export const DEFAULT_RULESET: Ruleset = {
  id: 'classic',
  name: 'Classic Killer Pool',
  description: 'Traditional killer pool rules: 3 starting lives, -1 for MISS, 0 for POT, +1 for POT BLACK',
  params: {
    starting_lives: 3,
    miss: -1,
    pot: 0,
    pot_black: 1,
    max_lives: 6,
  },
  is_default: true,
}

/**
 * Default player avatars
 */
export const DEFAULT_AVATARS = [
  '🎱', '🎯', '⚡', '🔥', '💎', '⭐', '🎪', '🎭',
  '🎨', '🎬', '🎮', '🎲', '🃏', '🎰', '🏆', '👑',
]

/**
 * Achievement types
 */
export type AchievementType =
  | 'first_win'        // First victory
  | 'wins_10'          // 10 total wins
  | 'wins_25'          // 25 total wins
  | 'wins_50'          // 50 total wins
  | 'win_streak_3'     // 3 wins in a row
  | 'win_streak_5'     // 5 wins in a row
  | 'survivor'         // Win with 1 life remaining
  | 'perfect_game'     // Win without losing any lives
  | 'pot_black_master' // 5+ pot blacks in one game
  | 'social_player'    // 10 games with 4+ players

/**
 * Achievement definition
 */
export interface AchievementDefinition {
  id: AchievementType
  name: string
  description: string
  icon: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

/**
 * User achievement (earned)
 */
export interface UserAchievement {
  id: string
  userhId: string
  achievementType: AchievementType
  unlockedAt: string
  gameId?: string
}

/**
 * All achievement definitions
 */
export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_win',
    name: 'First Blood',
    description: 'Win your first game',
    icon: '🏆',
    rarity: 'common',
  },
  {
    id: 'wins_10',
    name: 'Rising Star',
    description: 'Win 10 games',
    icon: '⭐',
    rarity: 'common',
  },
  {
    id: 'wins_25',
    name: 'Veteran',
    description: 'Win 25 games',
    icon: '🎖️',
    rarity: 'rare',
  },
  {
    id: 'wins_50',
    name: 'Legend',
    description: 'Win 50 games',
    icon: '👑',
    rarity: 'epic',
  },
  {
    id: 'win_streak_3',
    name: 'Hot Streak',
    description: 'Win 3 games in a row',
    icon: '🔥',
    rarity: 'rare',
  },
  {
    id: 'win_streak_5',
    name: 'Unstoppable',
    description: 'Win 5 games in a row',
    icon: '💥',
    rarity: 'epic',
  },
  {
    id: 'survivor',
    name: 'Survivor',
    description: 'Win a game with only 1 life remaining',
    icon: '💀',
    rarity: 'rare',
  },
  {
    id: 'perfect_game',
    name: 'Flawless Victory',
    description: 'Win without losing any lives',
    icon: '💎',
    rarity: 'legendary',
  },
  {
    id: 'pot_black_master',
    name: 'Black Magic',
    description: 'Score 5+ pot blacks in a single game',
    icon: '🎱',
    rarity: 'epic',
  },
  {
    id: 'social_player',
    name: 'Party Animal',
    description: 'Play 10 games with 4+ players',
    icon: '🎉',
    rarity: 'rare',
  },
]
