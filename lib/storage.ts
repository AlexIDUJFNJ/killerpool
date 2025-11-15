/**
 * LocalStorage utilities for Killerpool
 * 
 * Handles persistence of games and app state in browser localStorage.
 */

import { Game } from './types'

const STORAGE_KEYS = {
  CURRENT_GAME: 'killerpool_current_game',
  GAME_HISTORY: 'killerpool_game_history',
  SETTINGS: 'killerpool_settings',
} as const

/**
 * Save current game to localStorage
 */
export function saveCurrentGame(game: Game): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_GAME, JSON.stringify(game))
  } catch (error) {
    console.error('Failed to save game to localStorage:', error)
  }
}

/**
 * Load current game from localStorage
 */
export function loadCurrentGame(): Game | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_GAME)
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('Failed to load game from localStorage:', error)
    return null
  }
}

/**
 * Clear current game from localStorage
 */
export function clearCurrentGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_GAME)
  } catch (error) {
    console.error('Failed to clear game from localStorage:', error)
  }
}

/**
 * Save completed game to history
 */
export function saveToHistory(game: Game): void {
  if (game.status !== 'completed') {
    return
  }

  try {
    const history = loadGameHistory()
    history.unshift(game) // Add to beginning
    
    // Keep only last 50 games
    const trimmedHistory = history.slice(0, 50)
    
    localStorage.setItem(STORAGE_KEYS.GAME_HISTORY, JSON.stringify(trimmedHistory))
  } catch (error) {
    console.error('Failed to save game to history:', error)
  }
}

/**
 * Load game history from localStorage
 */
export function loadGameHistory(): Game[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.GAME_HISTORY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Failed to load game history:', error)
    return []
  }
}

/**
 * Clear all game history
 */
export function clearGameHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.GAME_HISTORY)
  } catch (error) {
    console.error('Failed to clear game history:', error)
  }
}

/**
 * Get a specific game from history by ID
 */
export function getGameFromHistory(gameId: string): Game | null {
  const history = loadGameHistory()
  return history.find(g => g.id === gameId) || null
}

/**
 * Delete a game from history
 */
export function deleteGameFromHistory(gameId: string): void {
  try {
    const history = loadGameHistory()
    const filtered = history.filter(g => g.id !== gameId)
    localStorage.setItem(STORAGE_KEYS.GAME_HISTORY, JSON.stringify(filtered))
  } catch (error) {
    console.error('Failed to delete game from history:', error)
  }
}

/**
 * Check if there's a current game in progress
 */
export function hasCurrentGame(): boolean {
  return loadCurrentGame() !== null
}
