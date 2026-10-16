'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { ArrowLeft, Trophy, TrendingUp, Activity, Award, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { loadGameHistory, getGuestId } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { ACTION_STYLES } from '@/components/game/action-styles'
import { computeStats, getMyIds, type PlayerStats } from './compute-stats'

export default function StatsPage() {
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const show = (userId: string | null) => {
      if (cancelled) return
      setStats(computeStats(loadGameHistory(), getMyIds(userId, getGuestId())))
      setLoading(false)
    }

    // Signed out, or Supabase unreachable: the guest id alone still finds
    // every game played on this device
    Promise.resolve()
      .then(() => createClient().auth.getUser())
      .then(({ data: { user } }) => show(user?.id ?? null))
      .catch((error) => {
        console.error('Failed to load stats:', error)
        show(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
            <Button asChild variant="ghost" size="icon">
              <Link href="/" aria-label="Back to home">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold">Statistics</h1>
          </div>
          <div className="flex justify-center items-center h-64">
            <div className="text-muted-foreground">Loading stats...</div>
          </div>
        </div>
      </main>
    )
  }

  if (!stats) {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
            <Button asChild variant="ghost" size="icon">
              <Link href="/" aria-label="Back to home">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold">Statistics</h1>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 sm:py-12">
                <Trophy className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg sm:text-xl font-semibold mb-2">No Games Played</h3>
                <p className="text-sm sm:text-base text-muted-foreground mb-6">
                  Play some games to see your statistics here!
                </p>
                <Button asChild>
                  <Link href="/game/new">Start New Game</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Button asChild variant="ghost" size="icon">
            <Link href="/" aria-label="Back to home">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Your Statistics</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Track your performance and progress</p>
          </div>
        </div>

        {/* Win Rate Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="mb-4 sm:mb-6 bg-linear-to-br from-primary/20 to-primary/5 border-primary/20">
            <CardContent className="pt-4 sm:pt-6">
              <div className="text-center">
                <Trophy className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-primary" />
                <div className="text-3xl sm:text-5xl font-bold mb-2">{stats.winRate.toFixed(1)}%</div>
                <div className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">Win Rate</div>
                <div className="flex justify-center gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <div className="font-semibold text-green-500">{stats.gamesWon}</div>
                    <div className="text-muted-foreground">Wins</div>
                  </div>
                  <div className="w-px bg-border" />
                  <div>
                    <div className="font-semibold text-red-500">{stats.gamesLost}</div>
                    <div className="text-muted-foreground">Losses</div>
                  </div>
                  <div className="w-px bg-border" />
                  <div>
                    <div className="font-semibold">{stats.totalGames}</div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {/* Actions Stats */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Actions
                </CardTitle>
                <CardDescription>Your gameplay actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Actions</span>
                  <Badge variant="secondary">{stats.totalActions}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Misses</span>
                  <Badge variant="outline" className={cn(ACTION_STYLES.miss.surface, ACTION_STYLES.miss.text)}>{stats.totalMisses}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Pots</span>
                  <Badge variant="outline" className={cn(ACTION_STYLES.pot.surface, ACTION_STYLES.pot.text)}>{stats.totalPots}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Black Pots</span>
                  <Badge variant="outline" className={cn(ACTION_STYLES.pot_black.surface, ACTION_STYLES.pot_black.text)}>{stats.totalBlackPots}</Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Performance Stats */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Performance
                </CardTitle>
                <CardDescription>Your game performance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Avg. Lives Remaining</span>
                  <Badge variant="secondary">
                    {stats.averageLivesRemaining.toFixed(1)} ❤️
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Current Streak</span>
                  <Badge className={stats.currentStreak > 0 ? 'bg-green-500' : ''}>
                    {stats.currentStreak} {stats.currentStreak > 0 ? '🔥' : ''}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Longest Win Streak</span>
                  <Badge variant="secondary">{stats.longestWinStreak} 🏆</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Best Performance</span>
                  <Badge variant="secondary">
                    {stats.bestGame?.livesRemaining || 0} lives
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Best Game */}
        {stats.bestGame && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Best Game
                </CardTitle>
                <CardDescription>Your most impressive performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold mb-1">
                      {stats.bestGame.livesRemaining} Lives Remaining
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(stats.bestGame.date).toLocaleDateString()}
                    </div>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/history/${stats.bestGame.id}`}>
                      View Game
                      <Zap className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </main>
  )
}
