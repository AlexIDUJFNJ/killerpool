/**
 * Game Context for Killerpool
 *
 * React Context for managing global game state with realtime sync.
 */

'use client'

import * as React from 'react'
import { Game, GameAction } from '@/lib/types'
import { applyAction, undoLastAction, getCurrentPlayer } from '@/lib/game-logic'
import { saveCurrentGame, loadCurrentGame, clearCurrentGame, saveToHistory } from '@/lib/storage'
import { autoSyncGame } from '@/lib/sync'
import { useRealtimeGame, useSyncGameForRealtime } from '@/hooks/use-realtime-game'
import { broadcastGameAction, updateGameStatus } from '@/lib/realtime'

interface GameContextValue {
  game: Game | null
  isLoading: boolean
  isRealtimeConnected: boolean
  startGame: (game: Game, enableRealtime?: boolean) => void
  performAction: (action: GameAction) => void
  undoAction: () => void
  endGame: () => void
  resumeGame: () => void
}

const GameContext = React.createContext<GameContextValue | undefined>(undefined)

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [game, setGame] = React.useState<Game | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [realtimeEnabled, setRealtimeEnabled] = React.useState(false)

  // Sync game for realtime when enabled
  const { isSynced } = useSyncGameForRealtime(realtimeEnabled ? game : null)

  // Setup realtime subscription
  const { isConnected: isRealtimeConnected } = useRealtimeGame(
    realtimeEnabled && game ? game.id : null,
    {
      enabled: realtimeEnabled && isSynced,
      onGameUpdate: (gameUpdate) => {
        setGame((currentGame) => {
          if (!currentGame) return null
          return {
            ...currentGame,
            ...gameUpdate,
          } as Game
        })
      },
      onNewAction: (action) => {
        console.log('New action from realtime:', action)
      },
    }
  )

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

      // If game is completed, save to history and sync to Supabase
      if (game.status === 'completed') {
        saveToHistory(game)
        // Auto-sync to Supabase in background
        autoSyncGame(game).catch((error) => {
          console.error('Failed to auto-sync game:', error)
        })
        // Update status in realtime if enabled
        if (realtimeEnabled) {
          updateGameStatus(game.id, 'completed', game.winnerId).catch((error) => {
            console.error('Failed to update game status in realtime:', error)
          })
        }
      }
    }
  }, [game, realtimeEnabled])

  const startGame = React.useCallback((newGame: Game, enableRealtime = false) => {
    setGame(newGame)
    setRealtimeEnabled(enableRealtime)
  }, [])

  const performAction = React.useCallback((action: GameAction) => {
    if (!game) return

    try {
      const updatedGame = applyAction(game, action)
      setGame(updatedGame)

      // Broadcast action via realtime if enabled and synced
      if (realtimeEnabled && isSynced) {
        const lastAction = updatedGame.history[updatedGame.history.length - 1]
        if (lastAction) {
          broadcastGameAction(game.id, lastAction).catch((error) => {
            console.error('Failed to broadcast game action:', error)
          })
        }
      }
    } catch (error) {
      console.error('Failed to perform action:', error)
    }
  }, [game, realtimeEnabled, isSynced])

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
    isRealtimeConnected,
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
