'use client'

import * as React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlayerCard } from '@/components/game/player-card'
import { SwipeablePlayerCard } from '@/components/game/swipeable-player-card'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { InviteModal } from '@/components/game/invite-modal'
import { useGame } from '@/contexts/game-context'
import { getCurrentPlayer, getActivePlayers, getNextPlayers } from '@/lib/game-logic'
import { GameAction } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RotateCcw, Home, Play, Users2, QrCode, Trophy, LogIn } from 'lucide-react'
import { haptics } from '@/lib/haptic'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'

export default function GamePage() {
  const router = useRouter()
  const params = useParams()
  const gameId = params.id as string
  const { game, performAction, undoAction, endGame } = useGame()
  const [showWinner, setShowWinner] = React.useState(false)
  const [showAllPlayers, setShowAllPlayers] = React.useState(false)
  const [showInviteModal, setShowInviteModal] = React.useState(false)
  const [currentPlayerKey, setCurrentPlayerKey] = React.useState(0)
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    if (!game) {
      router.push('/')
      return
    }

    if (game.id !== gameId) {
      router.push('/')
      return
    }

    if (game.status === 'completed') {
      setShowWinner(true)
      haptics.victory()
    }
  }, [game, gameId, router])

  // Check authentication status
  React.useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user)
    })
  }, [])

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

    // Increment key to trigger card animation
    setCurrentPlayerKey((prev) => prev + 1)

    // Perform action after brief delay for animation
    setTimeout(() => {
      performAction(gameAction)
    }, 300)
  }

  const handleUndo = () => {
    undoAction()
    haptics.tap()
    setCurrentPlayerKey((prev) => prev + 1)
  }

  const handleEndGame = () => {
    if (confirm('Are you sure you want to end this game?')) {
      endGame()
      router.push('/')
    }
  }

  const handleNewGame = () => {
    endGame()
    router.push('/game/new')
  }

  const handleGoHome = () => {
    router.push('/')
  }

  // Winner Screen
  if (showWinner && game.status === 'completed') {
    const winner = game.players.find((p) => p.id === game.winnerId)

    return (
      <main className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-background to-background" />
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
            <div className="text-8xl mb-4">{winner?.avatar || '🏆'}</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent mb-2">
              {winner?.name} Wins!
            </h1>
            <p className="text-muted-foreground">
              {game.history.length} actions • {game.players.length - activePlayers.length} players eliminated
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
              <Card className="border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-amber-600/5">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 mt-0.5">
                      <Trophy className="h-6 w-6 text-amber-500" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <h3 className="font-semibold text-base">Compete on the Leaderboard!</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Sign in to save your wins and climb the global rankings. Track your stats and prove you're the best!
                      </p>
                      <Link href="/auth" className="inline-block mt-2">
                        <Button size="sm" variant="outline" className="border-amber-500/50 hover:bg-amber-500/10">
                          <LogIn className="mr-2 h-4 w-4" />
                          Sign In to Compete
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {isAuthenticated === true && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-6"
            >
              <Card className="border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Trophy className="h-5 w-5 text-emerald-500" />
                    <p className="text-sm font-medium">Your victory has been saved to the leaderboard!</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="space-y-3"
          >
            <Button size="xl" className="w-full" onClick={handleNewGame}>
              <Play className="mr-2 h-5 w-5" />
              New Game
            </Button>
            <Button variant="outline" size="lg" className="w-full" onClick={handleGoHome}>
              <Home className="mr-2 h-5 w-5" />
              Home
            </Button>
          </motion.div>
        </motion.div>
      </main>
    )
  }

  // Game Screen
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowInviteModal(true)}
              title="Invite players"
            >
              <QrCode className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleUndo}
              disabled={game.history.length === 0}
              title="Undo last action"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAllPlayers(true)}
              title="View all players"
            >
              <Users2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-2xl mx-auto px-4 py-8 overflow-x-hidden">
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
        <div className="relative min-h-[500px] flex items-center justify-center">
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
                <SwipeablePlayerCard
                  name={currentPlayer.name}
                  avatar={currentPlayer.avatar}
                  lives={currentPlayer.lives}
                  maxLives={game.ruleset.params.max_lives}
                  onSwipe={handleSwipe}
                  disabled={game.status !== 'active'}
                />
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
          {game.history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEndGame}
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
        onClose={() => setShowAllPlayers(false)}
        title="All Players"
      >
        <div className="p-6 space-y-3">
          {game.players.map((player, index) => (
            <PlayerCard
              key={player.id}
              {...player}
              variant="compact"
              showPosition={index + 1}
              isActive={currentPlayer?.id === player.id}
              maxLives={game.ruleset.params.max_lives}
            />
          ))}
        </div>
      </BottomSheet>

      {/* Invite Modal */}
      <InviteModal
        gameId={game.id}
        gameName={`${game.players.length} Player Game`}
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
      />
    </main>
  )
}
