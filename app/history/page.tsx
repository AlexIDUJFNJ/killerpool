'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { deleteGameFromHistory, readGameHistorySnapshot, subscribeToGameHistory } from '@/lib/storage'
import { Game } from '@/lib/types'
import { motion } from 'motion/react'
import { ArrowLeft, Trophy, Users, Clock, Trash2, CloudUpload, CloudOff, Cloud, Check, Search, Filter } from 'lucide-react'
import { mergeGamesWithSupabase, isSupabaseAvailable, retryPendingSyncs } from '@/lib/sync'
import { cn } from '@/lib/utils'
import { ACTION_STYLES } from '@/components/game/action-styles'
import {
  filterGames,
  formatDuration,
  getGameWinner,
  isFinishedGame,
  staggerDelay,
  type DateFilter,
  type StatusFilter,
} from './history-utils'

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

const DATE_FILTERS: Array<[DateFilter, string]> = [
  ['all', 'All Time'],
  ['today', 'Today'],
  ['week', 'Last 7 Days'],
  ['month', 'Last 30 Days'],
]

const STATUS_FILTERS: Array<[StatusFilter, string]> = [
  ['all', 'All'],
  ['completed', 'Completed'],
  ['abandoned', 'Abandoned'],
]

const SYNC_ANNOUNCEMENTS: Record<SyncStatus, string> = {
  idle: '',
  syncing: 'Syncing your games…',
  success: 'History is up to date',
  error: 'Sync failed. Try again in a moment.',
}

// Module-level so useSyncExternalStore does not resubscribe on every render
function subscribeToConnectivity(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)
  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}
const getIsOnline = () => navigator.onLine
const getIsOnlineServer = () => true
// The server has no localStorage: it renders the page as not read yet, and
// so does hydration, after which the stored list takes over
const getHistoryOnServer = () => null

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

function BackHome() {
  return (
    <Button asChild variant="ghost" size="icon">
      <Link href="/" aria-label="Back to home">
        <ArrowLeft className="h-5 w-5" />
      </Link>
    </Button>
  )
}

export default function HistoryPage() {
  // Read from localStorage as an external store, so the list follows every
  // change to it: a delete, a Sync, a game finished in another tab. null
  // until it has been read, so an empty-state screen does not flash before
  // the list on every visit.
  const storedGames = React.useSyncExternalStore<readonly Game[] | null>(
    subscribeToGameHistory,
    readGameHistorySnapshot,
    getHistoryOnServer
  )
  const allGames = React.useMemo(
    () => (storedGames ? storedGames.filter(isFinishedGame) : null),
    [storedGames]
  )
  const [searchQuery, setSearchQuery] = React.useState('')
  const [dateFilter, setDateFilter] = React.useState<DateFilter>('all')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('idle')
  // Game waiting for the user to confirm its deletion
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  // isSupabaseAvailable() answers "is someone signed in", not "is there a
  // network" — the two used to share one flag, which showed every guest
  // "Offline"
  const [isSignedIn, setIsSignedIn] = React.useState<boolean | null>(null)
  const isOnline = React.useSyncExternalStore(subscribeToConnectivity, getIsOnline, getIsOnlineServer)
  const isSyncing = syncStatus === 'syncing'

  React.useEffect(() => {
    isSupabaseAvailable().then(setIsSignedIn)
  }, [])

  const filteredGames = React.useMemo(
    () => filterGames(allGames ?? [], { query: searchQuery, date: dateFilter, status: statusFilter }),
    [allGames, searchQuery, dateFilter, statusFilter]
  )

  const handleSync = async () => {
    setSyncStatus('syncing')

    try {
      // Upload first: games that finished offline, or hit a network error,
      // wait in the retry queue, and "Sync" used to only download
      await retryPendingSyncs()
      await mergeGamesWithSupabase()
      setSyncStatus('success')
    } catch (error) {
      console.error('Sync error:', error)
      setSyncStatus('error')
    }

    setTimeout(() => setSyncStatus('idle'), 3000)
  }

  const confirmDelete = () => {
    if (pendingDeleteId) deleteGameFromHistory(pendingDeleteId)
    setPendingDeleteId(null)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setDateFilter('all')
    setStatusFilter('all')
  }

  if (allGames === null) {
    return <main className="min-h-screen p-4 sm:p-6" aria-busy="true" />
  }

  if (allGames.length === 0) {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
            <BackHome />
            <h1 className="text-2xl sm:text-3xl font-bold">Game History</h1>
          </div>

          <div className="text-center py-12">
            <Trophy className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No games yet</h2>
            <p className="text-muted-foreground mb-6">
              Finish your first game to see it here
            </p>
            <Button asChild size="lg">
              <Link href="/game/new">Start New Game</Link>
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <BackHome />
            <h1 className="text-2xl sm:text-3xl font-bold">History</h1>
          </div>

          {isSignedIn === false && (
            <Button asChild variant="outline" size="sm">
              <Link href="/auth">
                <Cloud className="h-4 w-4" />
                Sign in to sync
              </Link>
            </Button>
          )}

          {isSignedIn && !isOnline && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CloudOff className="h-4 w-4" />
              <span>Offline</span>
            </div>
          )}

          {isSignedIn && isOnline && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {syncStatus === 'syncing' ? (
                <CloudUpload className="h-4 w-4 mr-2 motion-safe:animate-pulse" />
              ) : syncStatus === 'success' ? (
                <Check className={cn('h-4 w-4 mr-2', ACTION_STYLES.pot_black.text)} />
              ) : syncStatus === 'error' ? (
                <CloudOff className="h-4 w-4 mr-2 text-destructive" />
              ) : (
                <Cloud className="h-4 w-4 mr-2" />
              )}
              Sync
            </Button>
          )}
        </div>
        <p className="sr-only" role="status">
          {SYNC_ANNOUNCEMENTS[syncStatus]}
        </p>

        {/* Search and Filters */}
        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by player name..."
              aria-label="Search by player name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by date">
            <div className="flex items-center gap-2" aria-hidden="true">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Date:</span>
            </div>
            {DATE_FILTERS.map(([value, label]) => (
              <Button
                key={value}
                variant={dateFilter === value ? 'default' : 'outline'}
                size="sm"
                aria-pressed={dateFilter === value}
                onClick={() => setDateFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            <div className="flex items-center gap-2" aria-hidden="true">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Status:</span>
            </div>
            {STATUS_FILTERS.map(([value, label]) => (
              <Button
                key={value}
                variant={statusFilter === value ? 'default' : 'outline'}
                size="sm"
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Results Count */}
          {(searchQuery || dateFilter !== 'all' || statusFilter !== 'all') && (
            <div className="text-sm text-muted-foreground" role="status">
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
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGames.map((game, index) => {
              const winner = getGameWinner(game)

              return (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: staggerDelay(index) }}
                >
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2 mb-2">
                            {game.status === 'abandoned' ? (
                              <>
                                <span className="text-2xl" aria-hidden="true">⏸️</span>
                                <span>Game Abandoned</span>
                              </>
                            ) : winner ? (
                              <>
                                <span className="text-2xl" aria-hidden="true">{winner.avatar}</span>
                                <span>{winner.name} Won!</span>
                              </>
                            ) : (
                              <span>Game Over</span>
                            )}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {formatDate(game.createdAt)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              <span className="sr-only">Duration</span>
                              {formatDuration(game.createdAt, game.updatedAt)}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDeleteId(game.id)}
                          aria-label={`Delete game from ${formatDate(game.createdAt)}`}
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
                              <span aria-hidden="true">{player.avatar}</span>
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
                          <div className={cn('font-bold', ACTION_STYLES.pot_black.text)}>
                            {game.history.filter(h => h.action === 'pot_black').length}
                          </div>
                          <div className="text-xs text-muted-foreground">Black Pots</div>
                        </div>
                      </div>

                      <Button asChild variant="outline" className="w-full">
                        <Link href={`/history/${game.id}`}>
                          View Details
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <BottomSheet
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title="Delete this game?"
      >
        <div className="p-4 sm:p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            It is removed from this device&apos;s history and stats. If it was already uploaded,
            it still counts on the leaderboard.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="destructive" className="w-full sm:flex-1" onClick={confirmDelete}>
              Delete
            </Button>
            <Button variant="outline" className="w-full sm:flex-1" onClick={() => setPendingDeleteId(null)}>
              Keep it
            </Button>
          </div>
        </div>
      </BottomSheet>
    </main>
  )
}
