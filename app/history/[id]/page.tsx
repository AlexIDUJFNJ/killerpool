'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getGameFromHistory } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'
import { Game } from '@/lib/types'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Trophy,
  Users,
  Clock,
  TrendingDown,
  TrendingUp,
  Minus,
  Share2,
  Calendar,
  FileText,
  Image as ImageIcon,
  Check
} from 'lucide-react'
import { exportGameToCSV, exportScreenshot, shareGame, copyGameSummary } from '@/lib/export'

export default function GameDetailsPage() {
  const params = useParams()
  const [game, setGame] = React.useState<Game | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [notFound, setNotFound] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const [exportStatus, setExportStatus] = React.useState<'idle' | 'csv' | 'screenshot' | 'share'>('idle')

  React.useEffect(() => {
    const loadGame = async () => {
      const gameId = params.id as string
      setIsLoading(true)
      setNotFound(false)

      // First try localStorage
      const localGame = getGameFromHistory(gameId)
      if (localGame) {
        setGame(localGame)
        setIsLoading(false)
        return
      }

      // If not in localStorage, try Supabase
      try {
        const supabase = createClient()
        const { data: gameData, error } = await supabase
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single()

        if (error || !gameData) {
          setNotFound(true)
          setIsLoading(false)
          return
        }

        // Convert Supabase game to our Game type
        const convertedGame: Game = {
          id: gameData.id,
          createdAt: gameData.created_at,
          updatedAt: gameData.updated_at,
          status: gameData.status,
          players: gameData.participants,
          currentPlayerIndex: 0,
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
              max_lives: 10,
            },
            is_default: true,
          },
          history: gameData.history,
          createdBy: gameData.created_by,
        }

        setGame(convertedGame)
      } catch (error) {
        console.error('Failed to load game from Supabase:', error)
        setNotFound(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadGame()
  }, [params.id])

  const handleExportCSV = () => {
    if (!game) return

    setIsExporting(true)
    setExportStatus('csv')

    try {
      exportGameToCSV(game)
      setTimeout(() => {
        setExportStatus('idle')
        setIsExporting(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to export CSV:', error)
      setExportStatus('idle')
      setIsExporting(false)
    }
  }

  const handleExportScreenshot = async () => {
    setIsExporting(true)
    setExportStatus('screenshot')

    try {
      await exportScreenshot('game-details-content', `killerpool-game-${game?.id.slice(0, 8)}.png`)
      setTimeout(() => {
        setExportStatus('idle')
        setIsExporting(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to export screenshot:', error)
      alert('Screenshot export failed. This feature requires a modern browser.')
      setExportStatus('idle')
      setIsExporting(false)
    }
  }

  const handleShare = async () => {
    if (!game) return

    setIsExporting(true)
    setExportStatus('share')

    try {
      const success = await shareGame(game)
      if (!success) {
        // Fallback to copying summary
        await copyGameSummary(game)
        alert('Summary copied to clipboard!')
      }
    } catch (error) {
      console.error('Failed to share game:', error)
    } finally {
      setTimeout(() => {
        setExportStatus('idle')
        setIsExporting(false)
      }, 2000)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading game...</p>
          </div>
        </div>
      </main>
    )
  }

  if (notFound || !game) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Game Not Found</h2>
            <p className="text-muted-foreground mb-6">
              This game history could not be found. It may have been deleted or the link is incorrect.
            </p>
            <Link href="/history">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to History
              </Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const winner = game.players.find(p => p.id === game.winnerId)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
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

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'miss':
        return <TrendingDown className="h-4 w-4 text-red-500" />
      case 'pot':
        return <Minus className="h-4 w-4 text-yellow-500" />
      case 'pot_black':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      default:
        return null
    }
  }

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'miss':
        return 'MISS'
      case 'pot':
        return 'POT'
      case 'pot_black':
        return 'BLACK POT'
      default:
        return action
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'miss':
        return 'bg-red-500/10 text-red-500 border-red-500/20'
      case 'pot':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
      case 'pot_black':
        return 'bg-green-500/10 text-green-500 border-green-500/20'
      default:
        return 'bg-muted'
    }
  }

  // Calculate player statistics
  const getPlayerStats = (playerId: string) => {
    const playerHistory = game.history.filter(h => h.playerId === playerId)
    return {
      totalActions: playerHistory.length,
      misses: playerHistory.filter(h => h.action === 'miss').length,
      pots: playerHistory.filter(h => h.action === 'pot').length,
      blackPots: playerHistory.filter(h => h.action === 'pot_black').length,
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto" id="game-details-content">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/history">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Game Details</h1>
        </div>

        {/* Winner Card */}
        {winner && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Card className="border-2 border-green-500/50 bg-gradient-to-br from-green-500/10 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Trophy className="h-8 w-8 text-yellow-500" />
                  <div>
                    <div className="flex items-center gap-2 text-2xl">
                      <span>{winner.avatar}</span>
                      <span>{winner.name}</span>
                    </div>
                    <p className="text-sm font-normal text-muted-foreground mt-1">
                      Winner
                    </p>
                  </div>
                </CardTitle>
              </CardHeader>
            </Card>
          </motion.div>
        )}

        {/* Game Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Game Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Date</p>
                  <p className="font-semibold">{formatDate(game.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Duration</p>
                  <p className="font-semibold">
                    {formatDuration(game.createdAt, game.updatedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Players</p>
                  <p className="font-semibold">{game.players.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Actions</p>
                  <p className="font-semibold">{game.history.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Player Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Player Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {game.players.map((player) => {
                  const stats = getPlayerStats(player.id)
                  return (
                    <div
                      key={player.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        player.id === game.winnerId
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-border bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{player.avatar}</span>
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              {player.name}
                              {player.id === game.winnerId && (
                                <Trophy className="h-4 w-4 text-yellow-500" />
                              )}
                              {player.eliminated && (
                                <Badge variant="destructive" className="text-xs">
                                  Eliminated
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Final Lives: {player.lives}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="bg-background rounded-md p-2">
                          <div className="font-bold">{stats.totalActions}</div>
                          <div className="text-xs text-muted-foreground">Actions</div>
                        </div>
                        <div className="bg-red-500/10 rounded-md p-2">
                          <div className="font-bold text-red-500">{stats.misses}</div>
                          <div className="text-xs text-muted-foreground">Misses</div>
                        </div>
                        <div className="bg-yellow-500/10 rounded-md p-2">
                          <div className="font-bold text-yellow-500">{stats.pots}</div>
                          <div className="text-xs text-muted-foreground">Pots</div>
                        </div>
                        <div className="bg-green-500/10 rounded-md p-2">
                          <div className="font-bold text-green-500">{stats.blackPots}</div>
                          <div className="text-xs text-muted-foreground">Blacks</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Action Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Action Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {game.history.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.5) }}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${getActionColor(entry.action)}`}
                  >
                    <div className="flex-shrink-0">
                      {getActionIcon(entry.action)}
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{entry.playerName}</span>
                        <span className="text-sm text-muted-foreground">•</span>
                        <span className="text-sm font-medium">{getActionLabel(entry.action)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {entry.livesBefore} → {entry.livesAfter} lives
                        <span className="mx-2">•</span>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-sm text-muted-foreground">
                      #{game.history.length - index}
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Export Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleExportCSV}
            disabled={isExporting}
          >
            {exportStatus === 'csv' ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Export CSV
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleExportScreenshot}
            disabled={isExporting}
          >
            {exportStatus === 'screenshot' ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <ImageIcon className="h-4 w-4 mr-2" />
            )}
            Screenshot
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleShare}
            disabled={isExporting}
          >
            {exportStatus === 'share' ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Share2 className="h-4 w-4 mr-2" />
            )}
            Share
          </Button>
        </motion.div>
      </div>
    </main>
  )
}
