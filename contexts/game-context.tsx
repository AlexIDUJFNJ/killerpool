/**
 * Game Context for Killerpool
 * 
 * React Context for managing global game state.
 */

'use client'

import * as React from 'react'
import { Game, GameAction } from '@/lib/types'
import { applyAction, undoLastAction, getCurrentPlayer } from '@/lib/game-logic'
import { saveCurrentGame, loadCurrentGame, clearCurrentGame, saveToHistory } from '@/lib/storage'

interface GameContextValue {
  game: Game | null
  isLoading: boolean
  startGame: (game: Game) => void
  performAction: (action: GameAction) => void
  undoAction: () => void
  endGame: () => void
  resumeGame: () => void
}

const GameContext = React.createContext<GameContextValue | undefined>(undefined)

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [game, setGame] = React.useState<Game | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  // Load game from localStorage on mount
  React.useEffect(() => {
    const savedGame = loadCurrentGame()
    if (savedGame && savedGame.status === 'active') {
      setGame(savedGame)
    }
    setIsLoading(false)
  }, [])

  // Save game to localStorage whenever it changes
  React.useEffect(() => {
    if (game) {
      saveCurrentGame(game)
      
      // If game is completed, save to history
      if (game.status === 'completed') {
        saveToHistory(game)
      }
    }
  }, [game])

  const startGame = React.useCallback((newGame: Game) => {
    setGame(newGame)
  }, [])

  const performAction = React.useCallback((action: GameAction) => {
    if (!game) return

    try {
      const updatedGame = applyAction(game, action)
      setGame(updatedGame)
    } catch (error) {
      console.error('Failed to perform action:', error)
    }
  }, [game])

  const undoAction = React.useCallback(() => {
    if (!game || game.history.length === 0) return

    const updatedGame = undoLastAction(game)
    setGame(updatedGame)
  }, [game])

  const endGame = React.useCallback(() => {
    if (game) {
      const completedGame = { ...game, status: 'abandoned' as const }
      saveToHistory(completedGame)
    }
    clearCurrentGame()
    setGame(null)
  }, [game])

  const resumeGame = React.useCallback(() => {
    const savedGame = loadCurrentGame()
    if (savedGame && savedGame.status === 'active') {
      setGame(savedGame)
    }
  }, [])

  const value: GameContextValue = {
    game,
    isLoading,
    startGame,
    performAction,
    undoAction,
    endGame,
    resumeGame,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const context = React.useContext(GameContext)
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
