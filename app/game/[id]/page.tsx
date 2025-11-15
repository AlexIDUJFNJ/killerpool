'use client'

import * as React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlayerCard } from '@/components/game/player-card'
import { ActionButtons } from '@/components/game/action-buttons'
import { useGame } from '@/contexts/game-context'
import { getCurrentPlayer, getActivePlayers } from '@/lib/game-logic'
import { GameAction } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RotateCcw, Home, Play } from 'lucide-react'
import Link from 'next/link'

export default function GamePage() {
  const router = useRouter()
  const params = useParams()
  const gameId = params.id as string
  const { game, performAction, undoAction, endGame } = useGame()
  const [showWinner, setShowWinner] = React.useState(false)

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
    <main className="min-h-screen p-6 pb-32">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Game in Progress</h1>
              <p className="text-sm text-muted-foreground">
                {activePlayers.length} players remaining
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleUndo}
              disabled={game.history.length === 0}
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {currentPlayer && (
          <motion.div
            key={currentPlayer.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 text-center"
          >
            <p className="text-sm text-muted-foreground mb-2">Current Turn</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl">{currentPlayer.avatar}</span>
              <span className="text-2xl font-bold">{currentPlayer.name}</span>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <AnimatePresence mode="popLayout">
            {game.players.map((player) => (
              <PlayerCard
                key={player.id}
                {...player}
                isActive={currentPlayer?.id === player.id}
                maxLives={game.ruleset.params.max_lives}
              />
            ))}
          </AnimatePresence>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent">
          <div className="max-w-4xl mx-auto">
            <ActionButtons
              onAction={handleAction}
              disabled={game.status !== 'active'}
            />

            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-4"
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
