'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { loadGameHistory, deleteGameFromHistory } from '@/lib/storage'
import { Game } from '@/lib/types'
import { motion } from 'motion/react'
import { ArrowLeft, Trophy, Users, Clock, Trash2, CloudUpload, CloudOff, Cloud, Check, Search, Filter } from 'lucide-react'
import { mergeGamesWithSupabase, isSupabaseAvailable } from '@/lib/sync'

type DateFilter = 'all' | 'today' | 'week' | 'month'
type StatusFilter = 'all' | 'completed' | 'abandoned'

export default function HistoryPage() {
  const [allGames, setAllGames] = React.useState<Game[]>([])
  const [filteredGames, setFilteredGames] = React.useState<Game[]>([])
  const [searchQuery, setSearchQuery] = React.useState('')
  const [dateFilter, setDateFilter] = React.useState<DateFilter>('all')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [isOnline, setIsOnline] = React.useState(false)

  // Load games on mount
  React.useEffect(() => {
    const history = loadGameHistory()
    setAllGames(history)
    setFilteredGames(history)

    // Check if Supabase is available
    isSupabaseAvailable().then(setIsOnline)
  }, [])

  // Apply filters whenever search query or filters change
  React.useEffect(() => {
    let filtered = [...allGames]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(game =>
        game.players.some(player =>
          player.name.toLowerCase().includes(query)
        )
      )
    }

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      filtered = filtered.filter(game => {
        const gameDate = new Date(game.createdAt)

        switch (dateFilter) {
          case 'today':
            return gameDate >= today
          case 'week':
            const weekAgo = new Date(today)
            weekAgo.setDate(weekAgo.getDate() - 7)
            return gameDate >= weekAgo
          case 'month':
            const monthAgo = new Date(today)
            monthAgo.setMonth(monthAgo.getMonth() - 1)
            return gameDate >= monthAgo
          default:
            return true
        }
      })
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(game => game.status === statusFilter)
    }

    setFilteredGames(filtered)
  }, [searchQuery, dateFilter, statusFilter, allGames])

  const handleMerge = async () => {
    setIsSyncing(true)
    setSyncStatus('syncing')

    try {
      await mergeGamesWithSupabase()
      const history = loadGameHistory()
      setAllGames(history)
      setSyncStatus('success')

      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)
    } catch (error) {
      console.error('Merge error:', error)
      setSyncStatus('error')

      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDelete = (gameId: string) => {
    if (confirm('Delete this game from history?')) {
      deleteGameFromHistory(gameId)
      setAllGames(allGames.filter(g => g.id !== gameId))
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

  if (allGames.length === 0) {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold">Game History</h1>
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
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold">History</h1>
          </div>

          {isOnline && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMerge}
                disabled={isSyncing}
              >
                {syncStatus === 'syncing' ? (
                  <CloudUpload className="h-4 w-4 mr-2 animate-pulse" />
                ) : syncStatus === 'success' ? (
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                ) : (
                  <Cloud className="h-4 w-4 mr-2" />
                )}
                Sync
              </Button>
            </div>
          )}

          {!isOnline && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CloudOff className="h-4 w-4" />
              <span className="hidden sm:inline">Offline</span>
            </div>
          )}
        </div>

        {/* Search and Filters */}
        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by player name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Date:</span>
            </div>
            <Button
              variant={dateFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('all')}
            >
              All Time
            </Button>
            <Button
              variant={dateFilter === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('today')}
            >
              Today
            </Button>
            <Button
              variant={dateFilter === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('week')}
            >
              Last 7 Days
            </Button>
            <Button
              variant={dateFilter === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('month')}
            >
              Last 30 Days
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Status:</span>
            </div>
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('all')}
            >
              All
            </Button>
            <Button
              variant={statusFilter === 'completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('completed')}
            >
              Completed
            </Button>
            <Button
              variant={statusFilter === 'abandoned' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('abandoned')}
            >
              Abandoned
            </Button>
          </div>

          {/* Results Count */}
          {(searchQuery || dateFilter !== 'all' || statusFilter !== 'all') && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredGames.length} of {allGames.length} games
            </div>
          )}
        </div>

        {/* Games List */}
        {filteredGames.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No games found</h2>
            <p className="text-muted-foreground mb-6">
              Try adjusting your filters or search query
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('')
                setDateFilter('all')
                setStatusFilter('all')
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGames.map((game, index) => {
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

                    <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
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

                    <Link href={`/history/${game.id}`}>
                      <Button variant="outline" className="w-full">
                        View Details
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
