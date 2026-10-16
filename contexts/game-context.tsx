/**
 * Game Context for Killerpool
 *
 * React Context for managing global game state, its persistence, its upload
 * to Supabase and live sharing.
 */

'use client'

import * as React from 'react'
import { Game, GameAction, AchievementType } from '@/lib/types'
import { applyAction, undoLastAction, addPlayerToGame, abandonGame } from '@/lib/game-logic'
import {
  saveCurrentGame,
  loadCurrentGame,
  clearCurrentGame,
  saveToHistory,
  getGameFromHistory,
  getPendingSyncIds,
  markCurrentGameShared,
  isCurrentGameShared,
  resolveRosterPlayerId,
  rememberRosterPlayers,
} from '@/lib/storage'
import { syncFinishedGame, syncActiveGameToSupabase, type UpsertOutcome } from '@/lib/sync'
import { createHostSecret } from '@/lib/host-secret'
import { checkAchievementsForGame, onUnlockedAchievements } from '@/lib/achievements'
import { AchievementToasts } from '@/components/achievements/achievement-toast'
import { mapDbGameToGame } from '@/lib/game-mapper'
import { useRealtimeGame } from '@/hooks/use-realtime-game'
import { createClient } from '@/lib/supabase/client'

/**
 * Where the result of the completed game on screen stands with Supabase.
 * 'retrying': not uploaded yet, queued. 'refused': the server will not take
 * it. 'other-account': it belongs to an account that is not signed in.
 */
export type ResultSyncState = 'saving' | 'saved' | 'retrying' | 'refused' | 'other-account'

interface GameContextValue {
  game: Game | null
  isLoading: boolean
  isSpectatorMode: boolean
  isSharingEnabled: boolean
  /**
   * The signed-in account: undefined until the session has been read, null
   * for a guest. Follows signing in and out, in this tab or another.
   */
  currentUserId: string | null | undefined
  /** Upload state of the completed game on screen; null if there is none, or for a spectator */
  resultSync: ResultSyncState | null
  newAchievements: AchievementType[]
  dismissAchievement: () => void
  startGame: (game: Game) => void
  performAction: (action: GameAction) => void
  undoAction: () => void
  endGame: () => void
  loadGameFromSupabase: (gameId: string) => Promise<Game | null>
  setSpectatorGame: (game: Game) => void
  clearSpectatorGame: () => void
  enableSharing: () => Promise<boolean>
  addPlayer: (name: string, avatar: string) => void
}

const GameContext = React.createContext<GameContextValue | undefined>(undefined)

/** Identifies one completion: undoing a win and finishing again is another one */
function completionKey(game: Game): string {
  return `${game.id}@${game.updatedAt}`
}

function toResultSync(outcome: UpsertOutcome): ResultSyncState {
  if (outcome.ok) return 'saved'
  return outcome.failure === 'retry' ? 'retrying' : outcome.failure
}

/**
 * A game left unfinished — ended by the host, or replaced by a new one — goes
 * to history as abandoned instead of vanishing. If it can be in Supabase
 * (spectators have it, or a win that was later undone was uploaded), the row
 * is told too: otherwise spectators watch a game that never ends, or the
 * leaderboard keeps the undone win.
 */
function recordAbandonedGame(game: Game, wasShared: boolean): void {
  const mayBeInSupabase =
    wasShared ||
    getGameFromHistory(game.id)?.status === 'completed' ||
    getPendingSyncIds().includes(game.id)

  // Not a single shot and nobody else knows about it: there is nothing to keep
  if (game.history.length === 0 && !mayBeInSupabase) return

  const abandoned = abandonGame(game)
  saveToHistory(abandoned)
  if (mayBeInSupabase) {
    syncFinishedGame(abandoned).catch((error) => {
      console.error('Failed to sync abandoned game:', error)
    })
  }
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [game, setGame] = React.useState<Game | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSpectatorMode, setIsSpectatorMode] = React.useState(false)
  const [isSharingEnabled, setIsSharingEnabled] = React.useState(false)
  const [currentUserId, setCurrentUserId] = React.useState<string | null | undefined>(undefined)
  const [newAchievements, setNewAchievements] = React.useState<AchievementType[]>([])
  const [completionOutcome, setCompletionOutcome] = React.useState<{
    key: string
    outcome: UpsertOutcome
  } | null>(null)
  // Id of the completion whose pipeline (history + sync + achievements) already
  // ran. Cleared as soon as the game leaves 'completed', so undoing a win and
  // finishing again — possibly on a different winner — is processed afresh.
  const handledCompletionRef = React.useRef<string | null>(null)
  // The state last handed to the live writer, so the same state is never sent
  // twice (enableSharing writes it itself before the effect sees it)
  const lastBroadcastRef = React.useRef<Game | null>(null)
  // Counts realtime updates reaching a spectator, so a catch-up fetch can tell
  // whether an update overtook it while it was in flight
  const spectatorUpdatesRef = React.useRef(0)

  // Load game from localStorage on mount. An effect on purpose, and the one
  // set-state-in-effect warning left (see eslint.config.mjs): the first
  // client render has to match the server's, which has no storage, and from
  // here on the game is this provider's own state, storage only its copy.
  React.useEffect(() => {
    const savedGame = loadCurrentGame()
    if (savedGame && savedGame.status === 'active') {
      setGame(savedGame)
      // A reload used to end the broadcast while the host played on, freezing
      // every spectator on the last move before it. The sharing effect below
      // re-sends the restored state, which also covers a write the reload cut
      // off.
      setIsSharingEnabled(isCurrentGameShared(savedGame.id))
    }
    setIsLoading(false)
  }, [])

  // Who is signed in, followed rather than read once at mount: signing in or
  // out, or switching accounts in another tab, used to leave the previous
  // account's id here, so the winner screen judged "did I win" for it and the
  // next game was created under it. INITIAL_SESSION brings the first value.
  //
  // lib/sync.ts listens on the same (singleton) client to drop its cached
  // identity. That one decides whom a write goes out as and is checked with
  // the server; this one only tells the screens who is looking at them.
  React.useEffect(() => {
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user.id ?? null)
    })
    return () => subscription.unsubscribe()
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

  // While sharing, the row in Supabase follows every state of the game — it is
  // all the spectators see. The host never reads it back. It is the only
  // writer, and its old subscription to its own row merged every echo into
  // local state, so the late echo of one shot could undo the next.
  React.useEffect(() => {
    if (!game || isSpectatorMode || !isSharingEnabled) return
    if (lastBroadcastRef.current === game) return
    lastBroadcastRef.current = game

    // The completion pipeline below writes that state, and queues it for retry
    if (game.status === 'completed') return

    syncActiveGameToSupabase(game).then((outcome) => {
      if (!outcome.ok) {
        console.error('[sharing] Failed to sync game:', outcome.message)
      }
    })
  }, [game, isSharingEnabled, isSpectatorMode])

  // Save game to localStorage whenever it changes (skip for spectator mode)
  React.useEffect(() => {
    if (!game || isSpectatorMode) return

    saveCurrentGame(game)

    if (game.status !== 'completed') {
      // Undo took a win back. If that win was uploaded, the row has to follow,
      // or the leaderboard keeps a result that no longer stands. While sharing
      // the effect above sends every state anyway.
      if (handledCompletionRef.current === game.id && !isSharingEnabled) {
        syncActiveGameToSupabase(game).then((outcome) => {
          if (!outcome.ok) {
            console.error('Failed to retract an undone win:', outcome.message)
          }
        })
      }
      // Re-arm the pipeline. Nothing here sets state, so this cannot loop.
      handledCompletionRef.current = null
      return
    }

    // This completion was already handled
    if (handledCompletionRef.current === game.id) return
    handledCompletionRef.current = game.id

    saveToHistory(game)
    // Upload in background, then grant achievements (the RPC reads the game
    // row, so it must run after a successful sync; a failed sync is retried by
    // retryPendingSyncs, which also grants)
    const key = completionKey(game)
    syncFinishedGame(game)
      .then(async (outcome) => {
        setCompletionOutcome({ key, outcome })
        if (!outcome.ok) return
        const unlocked = await checkAchievementsForGame(game)
        if (unlocked.length > 0) {
          setNewAchievements((prev) => [...prev, ...unlocked])
        }
      })
      .catch((error) => {
        console.error('Failed to auto-sync game:', error)
      })
  }, [game, isSharingEnabled, isSpectatorMode])

  const startGame = React.useCallback((newGame: Game) => {
    // Starting over while a game is still running abandons that game. It used
    // to be overwritten without a trace — and, if shared, left live forever.
    if (game && !isSpectatorMode && game.status === 'active' && game.id !== newGame.id) {
      recordAbandonedGame(game, isSharingEnabled)
    }

    // This device is the game's host from now on, and the secret is how it
    // proves that to the database (lib/host-secret.ts). Before the first
    // write, which carries its hash; a game started again keeps its secret.
    createHostSecret(newGame.id)

    // Reset per-game modes so a new game doesn't inherit sharing/spectator
    // state from the previous one
    handledCompletionRef.current = null
    lastBroadcastRef.current = null
    setGame(newGame)
    setIsSpectatorMode(false)
    setIsSharingEnabled(false)
  }, [game, isSpectatorMode, isSharingEnabled])

  const performAction = React.useCallback((action: GameAction) => {
    // A finished game takes no more actions, and a spectator drives nothing
    if (!game || game.status !== 'active' || isSpectatorMode) return

    try {
      setGame(applyAction(game, action))
    } catch (error) {
      console.error('Failed to perform action:', error)
    }
  }, [game, isSpectatorMode])

  const undoAction = React.useCallback(() => {
    if (!game || game.history.length === 0 || isSpectatorMode) return

    setGame(undoLastAction(game))
  }, [game, isSpectatorMode])

  const addPlayer = React.useCallback((name: string, avatar: string) => {
    if (!game || game.status !== 'active' || isSpectatorMode) return

    try {
      // Someone joining mid-game is still the same person as last time
      const playerId = resolveRosterPlayerId(name)
      const updatedGame = addPlayerToGame(game, name, avatar, playerId)
      rememberRosterPlayers([{ id: playerId, name: name.trim(), avatar }])
      setGame(updatedGame)
    } catch (error) {
      console.error('Failed to add player:', error)
    }
  }, [game, isSpectatorMode])

  const endGame = React.useCallback(() => {
    // A spectator watching someone else's game must not wipe their own saved
    // game — the same guard the persistence effect above already has
    if (isSpectatorMode) return

    // A completed game is in history already; only one still in play is
    // abandoned
    if (game?.status === 'active') {
      recordAbandonedGame(game, isSharingEnabled)
    }
    handledCompletionRef.current = null
    lastBroadcastRef.current = null
    clearCurrentGame()
    setGame(null)
    setIsSharingEnabled(false)
  }, [game, isSpectatorMode, isSharingEnabled])

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

  // Set a game for spectator mode (don't save to localStorage). The realtime
  // subscription follows from isSpectatorMode, see useRealtimeGame below.
  const setSpectatorGame = React.useCallback((spectatorGame: Game) => {
    setGame(spectatorGame)
    setIsSpectatorMode(true)
  }, [])

  // Leave spectator mode
  const clearSpectatorGame = React.useCallback(() => {
    // Watching replaced the viewer's own game in memory — never in storage —
    // so put it back, or a host who opened a link lost their running game
    // until the next reload
    const ownGame = loadCurrentGame()
    const ownActive = ownGame && ownGame.status === 'active' ? ownGame : null
    setGame(ownActive)
    setIsSpectatorMode(false)
    setIsSharingEnabled(!!ownActive && isCurrentGameShared(ownActive.id))
  }, [])

  const spectatedGameId = isSpectatorMode && game ? game.id : null

  const applySpectatorUpdate = React.useCallback((update: Game) => {
    spectatorUpdatesRef.current += 1
    // Only onto the game it belongs to, never onto whatever replaced it
    setGame((current) => (current && current.id === update.id ? update : current))
  }, [])

  // Moves made while the channel was not subscribed yet — between loading the
  // game and joining, or during a reconnect — are never delivered. Fetch the
  // row each time the channel comes up, unless a realtime update overtakes the
  // fetch, in which case that update is the newer state.
  const catchUpSpectator = React.useCallback((connected: boolean) => {
    if (!connected || !spectatedGameId) return
    const seen = spectatorUpdatesRef.current
    loadGameFromSupabase(spectatedGameId).then((fresh) => {
      if (fresh && spectatorUpdatesRef.current === seen) {
        setGame((current) => (current && current.id === fresh.id ? fresh : current))
      }
    })
  }, [spectatedGameId, loadGameFromSupabase])

  useRealtimeGame(spectatedGameId, {
    onGameUpdate: applySpectatorUpdate,
    onStatus: catchUpSpectator,
  })

  // Enable sharing mode - puts the game in Supabase and keeps it there
  const enableSharing = React.useCallback(async (): Promise<boolean> => {
    if (!game || isSpectatorMode) {
      console.warn('[enableSharing] No game to share')
      return false
    }

    if (isSharingEnabled) {
      return true
    }

    try {
      // The row has to exist before the link is any use to a spectator
      lastBroadcastRef.current = game
      const outcome = await syncActiveGameToSupabase(game)

      if (!outcome.ok) {
        lastBroadcastRef.current = null
        console.error('[enableSharing] Sync failed for game:', game.id, outcome.message)
        return false
      }

      // Survives a reload, see the mount effect
      markCurrentGameShared(game.id)
      setIsSharingEnabled(true)

      return true
    } catch (error) {
      lastBroadcastRef.current = null
      console.error('[enableSharing] Error:', error instanceof Error ? error.message : error)
      return false
    }
  }, [game, isSharingEnabled, isSpectatorMode])

  const dismissAchievement = React.useCallback(() => {
    setNewAchievements((prev) => prev.slice(1))
  }, [])

  let resultSync: ResultSyncState | null = null
  if (game && !isSpectatorMode && game.status === 'completed') {
    resultSync =
      completionOutcome?.key === completionKey(game)
        ? toResultSync(completionOutcome.outcome)
        : 'saving'
  }

  const value: GameContextValue = {
    game,
    isLoading,
    isSpectatorMode,
    isSharingEnabled,
    currentUserId,
    resultSync,
    newAchievements,
    dismissAchievement,
    startGame,
    performAction,
    undoAction,
    endGame,
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
