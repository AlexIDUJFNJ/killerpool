/**
 * Game Context for Killerpool
 *
 * React Context for managing global game state with realtime sync.
 */

'use client'

import * as React from 'react'
import { Game, GameAction, AchievementType } from '@/lib/types'
import { applyAction, undoLastAction, addPlayerToGame } from '@/lib/game-logic'
import {
  saveCurrentGame,
  loadCurrentGame,
  clearCurrentGame,
  saveToHistory,
  resolveRosterPlayerId,
  rememberRosterPlayers,
} from '@/lib/storage'
import { autoSyncGame, syncActiveGameToSupabase } from '@/lib/sync'
import { checkAchievementsForGame, onUnlockedAchievements } from '@/lib/achievements'
import { AchievementToasts } from '@/components/achievements/achievement-toast'
import { mapDbGameToGame } from '@/lib/game-mapper'
import { useRealtimeGame, useSyncGameForRealtime } from '@/hooks/use-realtime-game'
import { updateGameStatus, subscribeToGame, unsubscribeFromGame } from '@/lib/realtime'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

interface GameContextValue {
  game: Game | null
  isLoading: boolean
  isRealtimeConnected: boolean
  isSpectatorMode: boolean
  isSharingEnabled: boolean
  currentUserId: string | null
  newAchievements: AchievementType[]
  dismissAchievement: () => void
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
  const [newAchievements, setNewAchievements] = React.useState<AchievementType[]>([])
  const spectatorChannelRef = React.useRef<RealtimeChannel | null>(null)
  // Id of the completion whose pipeline (history + sync + achievements) already
  // ran. Cleared as soon as the game leaves 'completed', so undoing a win and
  // finishing again — possibly on a different winner — is processed afresh.
  const handledCompletionRef = React.useRef<string | null>(null)

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

  // Achievements for games that synced late (retryPendingSyncs runs from
  // PWAInit, which sits outside this provider) still deserve their toast
  React.useEffect(
    () =>
      onUnlockedAchievements(types => {
        setNewAchievements(prev => [...prev, ...types.filter(t => !prev.includes(t))])
      }),
    []
  )

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
    if (!game || isSpectatorMode) return

    saveCurrentGame(game)

    if (game.status !== 'completed') {
      // Undo took the game back to 'active' — re-arm the pipeline. Nothing here
      // sets state, so this cannot loop.
      handledCompletionRef.current = null
      return
    }

    // This completion was already handled. Without the guard, the postgres echo
    // of our own updateGameStatus below would re-run this effect forever.
    if (handledCompletionRef.current === game.id) return
    handledCompletionRef.current = game.id

    saveToHistory(game)
    // Auto-sync to Supabase in background, then grant achievements
    // (the RPC reads the game row, so it must run after a successful sync;
    // a failed sync is retried by retryPendingSyncs, which also grants)
    autoSyncGame(game)
      .then(async (synced) => {
        if (!synced) return
        const unlocked = await checkAchievementsForGame(game)
        if (unlocked.length > 0) {
          setNewAchievements((prev) => [...prev, ...unlocked])
        }
      })
      .catch((error) => {
        console.error('Failed to auto-sync game:', error)
      })
    // Update status in realtime if enabled
    if (realtimeEnabled) {
      updateGameStatus(game.id, 'completed', game.winnerId).catch((error) => {
        console.error('Failed to update game status in realtime:', error)
      })
    }
  }, [game, realtimeEnabled, isSpectatorMode])

  const startGame = React.useCallback((newGame: Game, enableRealtime = false) => {
    // Reset per-game modes so a new game doesn't inherit sharing/spectator
    // state from the previous one
    if (spectatorChannelRef.current) {
      unsubscribeFromGame(spectatorChannelRef.current)
      spectatorChannelRef.current = null
    }
    handledCompletionRef.current = null
    setGame(newGame)
    setRealtimeEnabled(enableRealtime)
    setIsSpectatorMode(false)
    setIsSharingEnabled(false)
  }, [])

  const performAction = React.useCallback((action: GameAction) => {
    // A finished game takes no more actions, and a spectator drives nothing
    if (!game || game.status !== 'active' || isSpectatorMode) return

    try {
      const updatedGame = applyAction(game, action)
      setGame(updatedGame)

      // Sync full game state to Supabase if sharing is enabled
      // This ensures spectators see all updates in realtime
      if (isSharingEnabled) {
        syncActiveGameToSupabase(updatedGame).then((result) => {
          if (!result.success) {
            console.error('[performAction] Failed to sync game:', result.error)
          }
        }).catch((error) => {
          console.error('[performAction] Failed to sync game:', error)
        })
      }
    } catch (error) {
      console.error('Failed to perform action:', error)
    }
  }, [game, isSharingEnabled, isSpectatorMode])

  const undoAction = React.useCallback(() => {
    if (!game || game.history.length === 0 || isSpectatorMode) return

    const updatedGame = undoLastAction(game)
    setGame(updatedGame)

    // Sync to Supabase if sharing is enabled
    if (isSharingEnabled) {
      syncActiveGameToSupabase(updatedGame).catch((error) => {
        console.error('[undoAction] Failed to sync game:', error)
      })
    }
  }, [game, isSharingEnabled, isSpectatorMode])

  const addPlayer = React.useCallback((name: string, avatar: string) => {
    if (!game || game.status !== 'active' || isSpectatorMode) return

    try {
      // Someone joining mid-game is still the same person as last time
      const playerId = resolveRosterPlayerId(name)
      const updatedGame = addPlayerToGame(game, name, avatar, playerId)
      rememberRosterPlayers([{ id: playerId, name: name.trim(), avatar }])
      setGame(updatedGame)

      // Sync to Supabase if sharing is enabled
      if (isSharingEnabled) {
        syncActiveGameToSupabase(updatedGame).catch((error) => {
          console.error('[addPlayer] Failed to sync game:', error)
        })
      }
    } catch (error) {
      console.error('Failed to add player:', error)
    }
  }, [game, isSharingEnabled, isSpectatorMode])

  const endGame = React.useCallback(() => {
    // A spectator watching someone else's game must not wipe their own saved
    // game — the same guard the persistence effect above already has
    if (isSpectatorMode) return

    if (game) {
      const completedGame = { ...game, status: 'abandoned' as const }
      saveToHistory(completedGame)
    }
    handledCompletionRef.current = null
    clearCurrentGame()
    setGame(null)
  }, [game, isSpectatorMode])

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


      const { data: gameData, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()


      if (error || !gameData) {
        console.error('[loadGameFromSupabase] Failed:', error?.message, error?.details, error?.hint)
        return null
      }

      return mapDbGameToGame(gameData)
    } catch (error) {
      console.error('Error loading game from Supabase:', error)
      return null
    }
  }, [])

  // Set a game for spectator mode (don't save to localStorage)
  const setSpectatorGame = React.useCallback((spectatorGame: Game) => {
    // Cleanup previous spectator channel
    if (spectatorChannelRef.current) {
      unsubscribeFromGame(spectatorChannelRef.current)
    }

    setGame(spectatorGame)
    setIsSpectatorMode(true)
    setRealtimeEnabled(false)

    // Subscribe to realtime updates for spectator
    const channel = subscribeToGame(
      spectatorGame.id,
      (gameUpdate) => {
        setGame((currentGame) => {
          if (!currentGame) return null
          const updated = {
            ...currentGame,
            ...gameUpdate,
          } as Game
          return updated
        })
      },
      // Actions arrive folded into the game update above; nothing extra to do
      () => {}
    )

    if (!channel) {
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
      return true
    }

    try {

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

      return true
    } catch (error) {
      console.error('[enableSharing] Error:', error instanceof Error ? error.message : error)
      return false
    }
  }, [game, isSharingEnabled])

  const dismissAchievement = React.useCallback(() => {
    setNewAchievements((prev) => prev.slice(1))
  }, [])

  const value: GameContextValue = {
    game,
    isLoading,
    isRealtimeConnected,
    isSpectatorMode,
    isSharingEnabled,
    currentUserId,
    newAchievements,
    dismissAchievement,
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

  return (
    <GameContext.Provider value={value}>
      {children}
      {/* Rendered at app level so a toast that arrives after leaving the
          winner screen is still shown (and auto-drained) wherever the user is */}
      <AchievementToasts achievements={newAchievements} onDismiss={dismissAchievement} />
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = React.useContext(GameContext)
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
