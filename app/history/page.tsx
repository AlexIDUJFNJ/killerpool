'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { loadGameHistory, deleteGameFromHistory } from '@/lib/storage'
import { Game } from '@/lib/types'
import { motion } from 'framer-motion'
import { ArrowLeft, Trophy, Users, Clock, Trash2 } from 'lucide-react'

export default function HistoryPage() {
  const [games, setGames] = React.useState<Game[]>([])

  React.useEffect(() => {
    const history = loadGameHistory()
    setGames(history)
  }, [])

  const handleDelete = (gameId: string) => {
    if (confirm('Delete this game from history?')) {
      deleteGameFromHistory(gameId)
      setGames(games.filter(g => g.id !== gameId))
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  const formatDuration = (start: string, end: string) => {
    const duration = new Date(end).getTime() - new Date(start).getTime()
    const minutes = Math.floor(duration / 60000)
    const seconds = Math.floor((duration % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  if (games.length === 0) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">Game History</h1>
          </div>

          <div className="text-center py-12">
            <Trophy className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No games yet</h2>
            <p className="text-muted-foreground mb-6">
              Complete your first game to see it here
            </p>
            <Link href="/game/new">
              <Button size="lg">Start New Game</Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Game History</h1>
        </div>

        <div className="space-y-4">
          {games.map((game, index) => {
            const winner = game.players.find(p => p.id === game.winnerId)

            return (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 mb-2">
                          {winner && (
                            <>
                              <span className="text-2xl">{winner.avatar}</span>
                              <span>{winner.name} Won!</span>
                            </>
                          )}
                          {!winner && game.status === 'abandoned' && (
                            <>
                              <span className="text-2xl">⏸️</span>
                              <span>Game Abandoned</span>
                            </>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatDate(game.createdAt)}
                          </div>
                          {game.status === 'completed' && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {formatDuration(game.createdAt, game.updatedAt)}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(game.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div className="flex gap-2 flex-wrap">
                        {game.players.map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm"
                          >
                            <span>{player.avatar}</span>
                            <span>{player.name}</span>
                            {player.eliminated && (
                              <Badge variant="destructive" className="text-xs ml-1">
                                Out
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="bg-muted rounded-md p-2">
                        <div className="font-bold">{game.history.length}</div>
                        <div className="text-xs text-muted-foreground">Actions</div>
                      </div>
                      <div className="bg-muted rounded-md p-2">
                        <div className="font-bold">{game.players.length}</div>
                        <div className="text-xs text-muted-foreground">Players</div>
                      </div>
                      <div className="bg-muted rounded-md p-2">
                        <div className="font-bold">
                          {game.history.filter(h => h.action === 'pot_black').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Black Pots</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
