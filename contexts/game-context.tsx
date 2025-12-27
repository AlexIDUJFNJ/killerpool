/**
 * Game Context for Killerpool
 *
 * React Context for managing global game state with realtime sync.
 */

'use client'

import * as React from 'react'
import { Game, GameAction } from '@/lib/types'
import { applyAction, undoLastAction, getCurrentPlayer, addPlayerToGame } from '@/lib/game-logic'
import { saveCurrentGame, loadCurrentGame, clearCurrentGame, saveToHistory } from '@/lib/storage'
import { autoSyncGame, syncActiveGameToSupabase } from '@/lib/sync'
import { useRealtimeGame, useSyncGameForRealtime } from '@/hooks/use-realtime-game'
import { broadcastGameAction, updateGameStatus, subscribeToGame, unsubscribeFromGame } from '@/lib/realtime'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

interface GameContextValue {
  game: Game | null
  isLoading: boolean
  isRealtimeConnected: boolean
  isSpectatorMode: boolean
  isSharingEnabled: boolean
  currentUserId: string | null
  startGame: (game: Game, enableRealtime?: boolean) => void
  performAction: (action: GameAction) => void
  undoAction: () => void
  endGame: () => void
  resumeGame: () => void
  loadGameFromSupabase: (gameId: string) => Promise<Game | null>
  setSpectatorGame: (game: Game) => void
  clearSpectatorGame: () => void
  enableSharing: () => Promise<boolean>
  addPlayer: (name: string, avatar: string) => void
}

const GameContext = React.createContext<GameContextValue | undefined>(undefined)

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [game, setGame] = React.useState<Game | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [realtimeEnabled, setRealtimeEnabled] = React.useState(false)
  const [isSpectatorMode, setIsSpectatorMode] = React.useState(false)
  const [isSharingEnabled, setIsSharingEnabled] = React.useState(false)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const spectatorChannelRef = React.useRef<RealtimeChannel | null>(null)
  // Track completed games that have already been synced to prevent infinite loops
  const syncedCompletedGamesRef = React.useRef<Set<string>>(new Set())

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

  // Get current user ID
  React.useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id || null)
    })
  }, [])

  // Cleanup spectator channel on unmount
  React.useEffect(() => {
    return () => {
      if (spectatorChannelRef.current) {
        unsubscribeFromGame(spectatorChannelRef.current)
      }
    }
  }, [])

  // Save game to localStorage whenever it changes (skip for spectator mode)
  React.useEffect(() => {
    if (game && !isSpectatorMode) {
      saveCurrentGame(game)

      // If game is completed, save to history and sync to Supabase (only once per game)
      if (game.status === 'completed') {
        // Check if we've already synced this completed game to prevent infinite loops
        if (syncedCompletedGamesRef.current.has(game.id)) {
          console.log('[useEffect] Game already synced, skipping:', game.id)
          return
        }

        // Mark this game as synced
        syncedCompletedGamesRef.current.add(game.id)
        console.log('[useEffect] Syncing completed game:', game.id)

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
  }, [game, realtimeEnabled, isSpectatorMode])

  const startGame = React.useCallback((newGame: Game, enableRealtime = false) => {
    setGame(newGame)
    setRealtimeEnabled(enableRealtime)
  }, [])

  const performAction = React.useCallback((action: GameAction) => {
    if (!game) return

    try {
      const updatedGame = applyAction(game, action)
      setGame(updatedGame)

      // Sync full game state to Supabase if sharing is enabled
      // This ensures spectators see all updates in realtime
      if (isSharingEnabled) {
        console.log('[performAction] Syncing game state to Supabase for spectators')
        syncActiveGameToSupabase(updatedGame).then((result) => {
          if (!result.success) {
            console.error('[performAction] Failed to sync game:', result.error)
          } else {
            console.log('[performAction] Game synced successfully')
          }
        }).catch((error) => {
          console.error('[performAction] Failed to sync game:', error)
        })
      }
    } catch (error) {
      console.error('Failed to perform action:', error)
    }
  }, [game, isSharingEnabled])

  const undoAction = React.useCallback(() => {
    if (!game || game.history.length === 0) return

    const updatedGame = undoLastAction(game)
    setGame(updatedGame)

    // Sync to Supabase if sharing is enabled
    if (isSharingEnabled) {
      console.log('[undoAction] Syncing game state to Supabase for spectators')
      syncActiveGameToSupabase(updatedGame).catch((error) => {
        console.error('[undoAction] Failed to sync game:', error)
      })
    }
  }, [game, isSharingEnabled])

  const addPlayer = React.useCallback((name: string, avatar: string) => {
    if (!game || game.status !== 'active') return

    try {
      const updatedGame = addPlayerToGame(game, name, avatar)
      setGame(updatedGame)

      // Sync to Supabase if sharing is enabled
      if (isSharingEnabled) {
        console.log('[addPlayer] Syncing game state to Supabase for spectators')
        syncActiveGameToSupabase(updatedGame).catch((error) => {
          console.error('[addPlayer] Failed to sync game:', error)
        })
      }
    } catch (error) {
      console.error('Failed to add player:', error)
    }
  }, [game, isSharingEnabled])

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

  // Load a game from Supabase by ID (for spectators)
  const loadGameFromSupabase = React.useCallback(async (gameId: string): Promise<Game | null> => {
    try {
      const supabase = createClient()

      console.log('[loadGameFromSupabase] Loading game:', gameId)

      const { data: gameData, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      console.log('[loadGameFromSupabase] Result:', { gameData, error })

      if (error || !gameData) {
        console.error('[loadGameFromSupabase] Failed:', error?.message, error?.details, error?.hint)
        return null
      }

      // Convert database format to Game format
      // Use current_player_index from DB, fallback to calculating from players
      const currentPlayerIndex = gameData.current_player_index ??
        (gameData.participants?.findIndex((p: any) => !p.eliminated && p.lives > 0) ?? 0)

      const loadedGame: Game = {
        id: gameData.id,
        createdAt: gameData.created_at,
        updatedAt: gameData.updated_at,
        status: gameData.status,
        players: gameData.participants,
        currentPlayerIndex,
        winnerId: gameData.winner_id,
        rulesetId: gameData.ruleset_id,
        ruleset: {
          id: 'classic',
          name: 'Classic Killer Pool',
          params: {
            starting_lives: 3,
            miss: -1,
            pot: 0,
            pot_black: 1,
            max_lives: 6,
          },
          is_default: true,
        },
        history: gameData.history || [],
        createdBy: gameData.created_by,
      }

      return loadedGame
    } catch (error) {
      console.error('Error loading game from Supabase:', error)
      return null
    }
  }, [])

  // Set a game for spectator mode (don't save to localStorage)
  const setSpectatorGame = React.useCallback((spectatorGame: Game) => {
    console.log('[setSpectatorGame] Setting up spectator mode for game:', spectatorGame.id)

    // Cleanup previous spectator channel
    if (spectatorChannelRef.current) {
      unsubscribeFromGame(spectatorChannelRef.current)
    }

    setGame(spectatorGame)
    setIsSpectatorMode(true)
    setRealtimeEnabled(false)

    // Subscribe to realtime updates for spectator
    console.log('[setSpectatorGame] Subscribing to realtime updates...')
    const channel = subscribeToGame(
      spectatorGame.id,
      (gameUpdate) => {
        console.log('[Spectator] Received game update:', gameUpdate)
        setGame((currentGame) => {
          if (!currentGame) return null
          const updated = {
            ...currentGame,
            ...gameUpdate,
          } as Game
          console.log('[Spectator] Updated game state, players:', updated.players?.length)
          return updated
        })
      },
      (action) => {
        console.log('[Spectator] Received action:', action)
      }
    )

    if (channel) {
      console.log('[setSpectatorGame] Realtime channel created successfully')
    } else {
      console.error('[setSpectatorGame] Failed to create realtime channel!')
    }

    spectatorChannelRef.current = channel
  }, [])

  // Clear spectator game and cleanup
  const clearSpectatorGame = React.useCallback(() => {
    if (spectatorChannelRef.current) {
      unsubscribeFromGame(spectatorChannelRef.current)
      spectatorChannelRef.current = null
    }
    setGame(null)
    setIsSpectatorMode(false)
  }, [])

  // Enable sharing mode - syncs game to Supabase and enables realtime
  const enableSharing = React.useCallback(async (): Promise<boolean> => {
    if (!game) {
      console.warn('[enableSharing] No game to share')
      return false
    }

    if (isSharingEnabled) {
      console.log('[enableSharing] Already enabled for game:', game.id)
      return true
    }

    try {
      console.log('[enableSharing] Starting for game:', game.id)
      console.log('[enableSharing] Game players:', game.players?.length || 0)

      // Sync game to Supabase first (this ensures the game exists in DB)
      const syncResult = await syncActiveGameToSupabase(game)

      if (!syncResult.success) {
        console.error('[enableSharing] Sync failed for game:', game.id, syncResult.error)
        return false
      }

      // Enable realtime for broadcasting updates
      // The useSyncGameForRealtime hook will handle ongoing sync
      setRealtimeEnabled(true)
      setIsSharingEnabled(true)

      console.log('[enableSharing] Success! Game is now shareable:', game.id)
      return true
    } catch (error) {
      console.error('[enableSharing] Error:', error instanceof Error ? error.message : error)
      return false
    }
  }, [game, isSharingEnabled])

  const value: GameContextValue = {
    game,
    isLoading,
    isRealtimeConnected,
    isSpectatorMode,
    isSharingEnabled,
    currentUserId,
    startGame,
    performAction,
    undoAction,
    endGame,
    resumeGame,
    loadGameFromSupabase,
    setSpectatorGame,
    clearSpectatorGame,
    enableSharing,
    addPlayer,
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
