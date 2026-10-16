'use client'

import * as React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlayerCard } from '@/components/game/player-card'
import { SwipeablePlayerCard } from '@/components/game/swipeable-player-card'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { InviteModal } from '@/components/game/invite-modal'
import { useGame } from '@/contexts/game-context'
import { getCurrentPlayer, getActivePlayers, getNextPlayers, getSortedPlayers } from '@/lib/game-logic'
import { GameAction } from '@/lib/types'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, RotateCcw, Home, Play, UsersRound, QrCode, Trophy, LogIn, UserPlus } from 'lucide-react'
import { haptics } from '@/lib/haptic'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { saveRematchPlayers } from '@/lib/storage'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Eye } from 'lucide-react'
import { BlackBallCelebration } from '@/components/game/black-ball-celebration'
import type { ResultSyncState } from '@/contexts/game-context'

/** get_leaderboard's min_games default (supabase/migrations/00013) */
const LEADERBOARD_MIN_GAMES = 3

/** What the winner screen says while the result is not (yet) in Supabase */
const RESULT_SYNC_NOTES: Record<Exclude<ResultSyncState, 'saved'>, string> = {
  saving: 'Saving the result…',
  retrying:
    'The result could not be uploaded yet. It is kept on this device and uploads automatically when you are back online.',
  'other-account':
    'This game was started on another account. Sign in to that account to upload the result.',
  refused:
    'The server did not accept this result, so it will not count on the leaderboard. It is still in your history.',
}

export default function GamePage() {
  const router = useRouter()
  const params = useParams()
  const gameId = params.id as string
  const {
    game,
    isLoading,
    performAction,
    undoAction,
    endGame,
    isSpectatorMode,
    isSharingEnabled,
    currentUserId,
    resultSync,
    loadGameFromSupabase,
    setSpectatorGame,
    clearSpectatorGame,
    addPlayer
  } = useGame()
  const [showWinner, setShowWinner] = React.useState(false)
  const [showAllPlayers, setShowAllPlayers] = React.useState(false)
  const [showInviteModal, setShowInviteModal] = React.useState(false)
  const [currentPlayerKey, setCurrentPlayerKey] = React.useState(0)
  const [showAddPlayer, setShowAddPlayer] = React.useState(false)
  const [newPlayerName, setNewPlayerName] = React.useState('')
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null)
  const [isLoadingFromSupabase, setIsLoadingFromSupabase] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [showBlackCelebration, setShowBlackCelebration] = React.useState(false)
  const [confirmEndGame, setConfirmEndGame] = React.useState(false)
  const dismissCelebration = React.useCallback(() => setShowBlackCelebration(false), [])
  // The game id the load below has run for. A plain boolean meant moving from
  // one game link to another never loaded the second game.
  const initializedForRef = React.useRef<string | null>(null)
  const lastHistoryLengthRef = React.useRef(0)

  // Load game from Supabase if not in context (only once on mount)
  // IMPORTANT: Wait for context to finish loading from localStorage before
  // attempting Supabase load, to prevent the host from entering spectator mode.
  React.useEffect(() => {
    // Skip if already initialized for this gameId
    if (initializedForRef.current === gameId) {
      return
    }

    // Wait for game context to finish loading from localStorage
    if (isLoading) {
      return
    }

    // If we already have a game with correct ID (local game), no need to load
    if (game && game.id === gameId) {
      initializedForRef.current = gameId
      if (game.status === 'completed') {
        setShowWinner(true)
        haptics.victory()
      }
      return
    }

    const loadGame = async () => {
      // Mark as initialized to prevent duplicate loads
      initializedForRef.current = gameId

      // Try to load from Supabase (this path is for spectators only)
      setIsLoadingFromSupabase(true)
      setLoadError(null)

      try {
        const loadedGame = await loadGameFromSupabase(gameId)

        if (loadedGame) {
          // Set as spectator game (will subscribe to realtime)
          setSpectatorGame(loadedGame)

          if (loadedGame.status === 'completed') {
            setShowWinner(true)
          }
        } else {
          setLoadError('Game not found')
          // Redirect to home after a delay
          setTimeout(() => {
            router.push('/')
          }, 2000)
        }
      } catch (error) {
        console.error('Error loading game:', error)
        setLoadError('Failed to load game')
        setTimeout(() => {
          router.push('/')
        }, 2000)
      } finally {
        setIsLoadingFromSupabase(false)
      }
    }

    loadGame()
  }, [gameId, game, isLoading, loadGameFromSupabase, setSpectatorGame, router])

  // Leave spectator mode on unmount. Read through a ref: as a dependency,
  // isSpectatorMode made the cleanup run whenever it changed rather than on
  // unmount, each time with the value from the render before.
  const isSpectatorModeRef = React.useRef(isSpectatorMode)
  React.useEffect(() => {
    isSpectatorModeRef.current = isSpectatorMode
  }, [isSpectatorMode])

  React.useEffect(() => {
    return () => {
      if (isSpectatorModeRef.current) {
        clearSpectatorGame()
      }
    }
  }, [clearSpectatorGame])

  // Check authentication status
  React.useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user)
    })
  }, [])

  // Watch for pot_black actions (spectator mode — detect from realtime updates)
  // Only trigger when history grows by exactly 1 (a single new realtime action),
  // not on initial load where history jumps from 0 to N all at once.
  React.useEffect(() => {
    if (!game) return
    const historyLen = game.history.length
    if (historyLen === lastHistoryLengthRef.current + 1) {
      const lastAction = game.history[historyLen - 1]
      if (lastAction?.action === 'pot_black' && isSpectatorMode) {
        setShowBlackCelebration(true)
      }
    }
    lastHistoryLengthRef.current = historyLen
  }, [game?.history.length, game, isSpectatorMode])

  // Watch for game completion and show winner screen
  React.useEffect(() => {
    if (game && game.status === 'completed' && !showWinner) {
      setShowWinner(true)
      haptics.victory()
    }
  }, [game, showWinner])

  // Show loading state
  if (isLoading || isLoadingFromSupabase) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading game...</p>
        </div>
      </main>
    )
  }

  // Show error state
  if (loadError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-destructive mb-2">{loadError}</p>
          <p className="text-sm text-muted-foreground">Redirecting to home...</p>
        </div>
      </main>
    )
  }

  if (!game) {
    return null
  }

  const currentPlayer = getCurrentPlayer(game)
  const activePlayers = getActivePlayers(game)
  const nextPlayers = getNextPlayers(game, 1)
  const nextPlayer = nextPlayers[0]

  const handleSwipe = (action: 'miss' | 'pot' | 'pot_black') => {
    // Map swipe action to GameAction
    const actionMap: Record<string, GameAction> = {
      miss: 'miss',
      pot: 'pot',
      pot_black: 'pot_black',
    }

    const gameAction = actionMap[action]

    // Trigger celebration for black ball
    if (action === 'pot_black') {
      setShowBlackCelebration(true)
    }

    // Increment key to trigger card animation
    setCurrentPlayerKey((prev) => prev + 1)

    // Applied straight away. The card animation is driven by currentPlayerKey
    // and AnimatePresence, so the old 300ms timer bought nothing visually —
    // it only opened a window where a second swipe ran against the state
    // captured before the first one landed, silently dropping an action.
    performAction(gameAction)
  }

  const handleUndo = () => {
    undoAction()
    haptics.tap()
    setCurrentPlayerKey((prev) => prev + 1)
  }

  const handleEndGame = () => {
    setConfirmEndGame(false)
    endGame()
    router.push('/')
  }

  // Taking back the shot that decided the game. The winner screen goes away
  // with it, and comes back (with its haptics) when the game is won again.
  const handleUndoWin = () => {
    undoAction()
    haptics.tap()
    setShowWinner(false)
    setCurrentPlayerKey((prev) => prev + 1)
  }

  const handleNewGame = () => {
    // Save current players for rematch
    if (game) {
      const players = game.players.map(p => ({
        name: p.name,
        avatar: p.avatar,
        // Carry over who the creator is, so the rematch does not have to
        // guess it again from row order. Not on a spectator's device: the
        // userId there is the host's, and marking that row "you" would hand
        // the spectator's own account to somebody else's name.
        isOwner: !isSpectatorMode && !!p.userId,
      }))
      saveRematchPlayers(players)
    }

    // Don't call endGame() here - it causes redirect to home
    // The new game will replace the current one via startGame()
    router.push('/game/new')
  }

  const handleGoHome = () => {
    router.push('/')
  }

  // Winner Screen
  if (showWinner && game.status === 'completed') {
    const winner = game.players.find((p) => p.id === game.winnerId)
    // Only the creator carries a userId, so this is true exactly when the
    // signed-in user is the one who actually won
    const didIWin = !!currentUserId && winner?.userId === currentUserId

    return (
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-emerald-500/20 via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.2),transparent)]" />

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative z-10 text-center max-w-md"
        >
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="text-6xl sm:text-8xl mb-4">{winner?.avatar || '🏆'}</div>
            <h1 className="text-2xl sm:text-4xl font-bold bg-linear-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent mb-2">
              {winner?.name} Wins!
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {game.history.length} actions • {game.players.length - activePlayers.length} eliminated
            </p>
          </motion.div>

          {/* Authentication Info */}
          {isAuthenticated === false && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-6"
            >
              <Card className="border-amber-500/50 bg-linear-to-br from-amber-500/10 to-amber-600/5">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="shrink-0 mt-0.5">
                      <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <h3 className="font-semibold text-sm sm:text-base">Compete on the Leaderboard!</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        Sign in to save your wins and climb the global rankings.
                      </p>
                      <Link href="/auth" className="inline-block mt-2">
                        <Button size="sm" variant="outline" className="border-amber-500/50 hover:bg-amber-500/10 text-xs sm:text-sm">
                          <LogIn className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          Sign In
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* currentUserId arrives asynchronously; waiting for it avoids
              flashing the wrong message at the actual winner. Claimed only once
              the upload is confirmed: this used to say "saved" the moment the
              screen appeared, whatever the network did. */}
          {isAuthenticated === true && currentUserId !== null && didIWin && !isSpectatorMode && resultSync === 'saved' && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-6"
            >
              <Card className="border-emerald-500/50 bg-linear-to-br from-emerald-500/10 to-emerald-600/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 text-left">
                    <Trophy className="h-5 w-5 shrink-0 text-emerald-500" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Your win is saved to your stats.</p>
                      <p className="text-xs text-muted-foreground">
                        The leaderboard ranks players once they have played {LEADERBOARD_MIN_GAMES} games.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {isAuthenticated === true && currentUserId !== null && !didIWin && !isSpectatorMode && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-6"
            >
              <Card className="border-border/60 bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {winner?.name} takes this one. The result is saved to your history.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {isAuthenticated === true && !isSpectatorMode && resultSync && resultSync !== 'saved' && (
            <p className="mb-6 text-xs sm:text-sm text-muted-foreground" role="status">
              {RESULT_SYNC_NOTES[resultSync]}
            </p>
          )}

          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="space-y-3"
          >
            <Button size="xl" className="w-full" onClick={() => setShowInviteModal(true)}>
              <QrCode className="mr-2 h-5 w-5" />
              Share Game
            </Button>
            <Button size="lg" className="w-full" onClick={handleNewGame}>
              <Play className="mr-2 h-5 w-5" />
              New Game
            </Button>
            {!isSpectatorMode && game.history.length > 0 && (
              <Button variant="ghost" size="lg" className="w-full" onClick={handleUndoWin}>
                <RotateCcw className="mr-2 h-5 w-5" />
                Undo last shot
              </Button>
            )}
            <Button variant="outline" size="lg" className="w-full" onClick={handleGoHome}>
              <Home className="mr-2 h-5 w-5" />
              Home
            </Button>
          </motion.div>
        </motion.div>

        {/* Invite Modal for sharing from winner screen */}
        <InviteModal
          gameId={game.id}
          gameName={`${game.players.length} Player Game`}
          open={showInviteModal}
          onOpenChange={setShowInviteModal}
        />
      </main>
    )
  }

  // Game Screen
  return (
    <main className="min-h-screen bg-linear-to-br from-background via-background to-primary/5 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60 border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-bold">Killer Pool</h1>
              <p className="text-xs text-muted-foreground">
                {activePlayers.length} players remaining
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* QR/Share button - available for both admin and spectators */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowInviteModal(true)}
              title="Share game"
            >
              <QrCode className="h-5 w-5" />
            </Button>
            {/* Undo button - only for admin (non-spectator) */}
            {!isSpectatorMode && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleUndo}
                disabled={game.history.length === 0}
                title="Undo last action"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAllPlayers(true)}
              title="View all players"
            >
              <UsersRound className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* The host ended the game early: nobody won, and no more moves come */}
        {isSpectatorMode && game.status === 'abandoned' && (
          <div className="bg-muted border-t px-4 py-2 text-center text-sm text-muted-foreground">
            The host ended this game before anyone won.
          </div>
        )}

        {/* Spectator Banner */}
        {isSpectatorMode && game.status !== 'abandoned' && (
          <div className="bg-amber-500/10 border-t border-amber-500/20 px-4 py-2">
            <div className="flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <Eye className="h-4 w-4" />
              <span>You are watching this game</span>
              <button
                onClick={() => setShowInviteModal(true)}
                className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 transition-colors text-xs font-medium"
              >
                <QrCode className="h-3.5 w-3.5" />
                Share
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="container max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8 overflow-x-hidden">
        {/* Next Up Indicator */}
        <AnimatePresence mode="wait">
          {nextPlayer && (
            <motion.div
              key={`next-${nextPlayer.id}`}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center mb-6"
            >
              <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">
                Next Up
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full">
                <span className="text-2xl">{nextPlayer.avatar}</span>
                <span className="font-medium">{nextPlayer.name}</span>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(nextPlayer.lives, 5) }).map((_, i) => (
                    <div key={i} className="h-2 w-2 rounded-full bg-emerald-500" />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Current Player Card */}
        <div className="relative min-h-[400px] sm:min-h-[500px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {currentPlayer && (
              <motion.div
                key={`player-${currentPlayer.id}-${currentPlayerKey}`}
                initial={{ scale: 0.8, opacity: 0, rotateY: -90 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                exit={{
                  scale: 0.8,
                  opacity: 0,
                  rotateY: 90,
                  transition: { duration: 0.3 },
                }}
                transition={{
                  type: 'spring',
                  damping: 20,
                  stiffness: 200,
                }}
                className="w-full"
              >
                {isSpectatorMode ? (
                  <PlayerCard
                    id={currentPlayer.id}
                    name={currentPlayer.name}
                    avatar={currentPlayer.avatar}
                    lives={currentPlayer.lives}
                    eliminated={currentPlayer.eliminated}
                    maxLives={game.ruleset.params.max_lives}
                    isActive={true}
                  />
                ) : (
                  <SwipeablePlayerCard
                    name={currentPlayer.name}
                    avatar={currentPlayer.avatar}
                    lives={currentPlayer.lives}
                    maxLives={game.ruleset.params.max_lives}
                    onSwipe={handleSwipe}
                    disabled={game.status !== 'active'}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Game Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center space-y-2"
        >
          <p className="text-sm text-muted-foreground">
            Actions: {game.history.length}
          </p>
          {!isSpectatorMode && game.history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmEndGame(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              End Game
            </Button>
          )}
        </motion.div>
      </div>

      {/* Bottom Sheet - All Players */}
      <BottomSheet
        isOpen={showAllPlayers}
        onClose={() => {
          setShowAllPlayers(false)
          setShowAddPlayer(false)
          setNewPlayerName('')
        }}
        title="All Players"
      >
        <div className="p-4 sm:p-6 space-y-2 sm:space-y-3">
          {/* Add Player Button/Form - only for non-spectators during active game */}
          {!isSpectatorMode && game.status === 'active' && (
            <div className="mb-4">
              {showAddPlayer ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Player name"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newPlayerName.trim()) {
                        const avatars = ['🎱', '🎯', '🏆', '⭐', '🔥', '💎', '🎪', '🎲']
                        const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)]
                        addPlayer(newPlayerName.trim(), randomAvatar)
                        setNewPlayerName('')
                        setShowAddPlayer(false)
                        haptics.tap()
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    onClick={() => {
                      if (newPlayerName.trim()) {
                        const avatars = ['🎱', '🎯', '🏆', '⭐', '🔥', '💎', '🎪', '🎲']
                        const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)]
                        addPlayer(newPlayerName.trim(), randomAvatar)
                        setNewPlayerName('')
                        setShowAddPlayer(false)
                        haptics.tap()
                      }
                    }}
                    disabled={!newPlayerName.trim()}
                  >
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowAddPlayer(false)
                      setNewPlayerName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAddPlayer(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Player
                </Button>
              )}
            </div>
          )}

          {/* Players list - sorted: active first, eliminated last */}
          {getSortedPlayers(game).map((player, index) => (
            <div key={player.id} className={player.eliminated ? 'opacity-50' : ''}>
              <PlayerCard
                {...player}
                variant="compact"
                showPosition={index + 1}
                isActive={currentPlayer?.id === player.id}
                maxLives={game.ruleset.params.max_lives}
              />
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* End Game confirmation */}
      <BottomSheet
        isOpen={confirmEndGame}
        onClose={() => setConfirmEndGame(false)}
        title="End this game?"
      >
        <div className="p-4 sm:p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Nobody wins. The game is kept in your history as unfinished
            {isSharingEnabled ? ', and spectators see that it has ended' : ''}.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="destructive" className="w-full sm:flex-1" onClick={handleEndGame}>
              End game
            </Button>
            <Button variant="outline" className="w-full sm:flex-1" onClick={() => setConfirmEndGame(false)}>
              Keep playing
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Invite Modal */}
      <InviteModal
        gameId={game.id}
        gameName={`${game.players.length} Player Game`}
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
      />

      {/* Black Ball Celebration */}
      <BlackBallCelebration
        show={showBlackCelebration}
        onComplete={dismissCelebration}
      />
    </main>
  )
}
