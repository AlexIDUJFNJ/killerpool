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
