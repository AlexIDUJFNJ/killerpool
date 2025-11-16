'use client'

import * as React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlayerCard } from '@/components/game/player-card'
import { ActionButtons } from '@/components/game/action-buttons'
import { useGame } from '@/contexts/game-context'
import { getCurrentPlayer, getActivePlayers, getNextPlayers } from '@/lib/game-logic'
import { GameAction } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RotateCcw, Home, Play, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'

export default function GamePage() {
  const router = useRouter()
  const params = useParams()
  const gameId = params.id as string
  const { game, performAction, undoAction, endGame } = useGame()
  const [showWinner, setShowWinner] = React.useState(false)
  const [showAllPlayers, setShowAllPlayers] = React.useState(true)

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
    }
  }, [game, gameId, router])

  if (!game) {
    return null
  }

  const currentPlayer = getCurrentPlayer(game)
  const activePlayers = getActivePlayers(game)
  const nextPlayers = getNextPlayers(game, 2)

  const handleAction = (action: GameAction) => {
    performAction(action)
  }

  const handleUndo = () => {
    undoAction()
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

  if (showWinner && game.status === 'completed') {
    const winner = game.players.find(p => p.id === game.winnerId)

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

  return (
    <main className="min-h-screen pb-64 md:pb-32">
      <div className="max-w-4xl mx-auto">
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
                <h1 className="text-lg font-bold">Game in Progress</h1>
                <p className="text-xs text-muted-foreground">
                  {activePlayers.length} players remaining
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleUndo}
              disabled={game.history.length === 0}
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>

          {/* Current Player - Sticky */}
          {currentPlayer && (
            <motion.div
              key={currentPlayer.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-4 py-3 bg-primary/5 border-t"
            >
              <PlayerCard
                {...currentPlayer}
                variant="inline"
                maxLives={game.ruleset.params.max_lives}
              />
            </motion.div>
          )}
        </div>

        {/* Next Up Section */}
        {nextPlayers.length > 0 && (
          <div className="px-4 py-4 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Next Up
            </p>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {nextPlayers.map((player) => (
                  <PlayerCard
                    key={player.id}
                    {...player}
                    variant="mini"
                    maxLives={game.ruleset.params.max_lives}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* All Players Section - Collapsible */}
        <div className="px-4 py-4">
          <button
            onClick={() => setShowAllPlayers(!showAllPlayers)}
            className="flex items-center justify-between w-full mb-3 group"
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              All Players ({game.players.length})
            </p>
            {showAllPlayers ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </button>

          <AnimatePresence>
            {showAllPlayers && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-2 overflow-hidden"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons - Fixed Bottom */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent border-t md:p-6">
          <div className="max-w-4xl mx-auto space-y-3">
            <ActionButtons
              onAction={handleAction}
              disabled={game.status !== 'active'}
              compact
            />

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={handleEndGame}
            >
              End Game
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
