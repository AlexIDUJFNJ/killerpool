'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LeaderboardCard, LeaderboardEntry } from './leaderboard-card'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trophy, TrendingUp, LogIn, Crown, Target, Star } from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

interface LeaderboardListProps {
  limit?: number
  className?: string
}

export function LeaderboardList({ limit = 15, className }: LeaderboardListProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    loadLeaderboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit])

  useEffect(() => {
    const supabase = createClient()

    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadLeaderboard = async () => {
    try {
      setLoading(true)
      setError(null)

      const supabase = createClient()

      // Call the leaderboard function
      const { data, error: queryError } = await supabase
        .rpc('get_leaderboard', { limit_count: limit })

      if (queryError) {
        console.error('Error loading leaderboard:', queryError)
        setError(queryError.message)
        return
      }

      setEntries(data || [])
    } catch (err) {
      console.error('Failed to load leaderboard:', err)
      setError('Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={className}>
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="inline-block mb-4"
            >
              <Trophy className="h-12 w-12 text-primary" />
            </motion.div>
            <div className="text-muted-foreground">Loading leaderboard...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={className}>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <TrendingUp className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">Error Loading Leaderboard</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <button
                onClick={loadLeaderboard}
                className="text-primary hover:underline"
              >
                Try Again
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className={className}>
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="text-center py-12 px-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.6 }}
                className="mb-6"
              >
                <div className="relative inline-block">
                  <Trophy className="h-20 w-20 mx-auto text-amber-500" />
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                    className="absolute -top-2 -right-2"
                  >
                    <Crown className="h-8 w-8 text-amber-400" />
                  </motion.div>
                </div>
              </motion.div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <h3 className="text-2xl font-bold bg-linear-to-r from-amber-500 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                  The Leaderboard Awaits!
                </h3>

                {!user ? (
                  <>
                    <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                      Sign in now to compete for glory! Every victory, every pot black, every brilliant play will be recorded for all to see.
                    </p>

                    <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto my-8">
                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-center"
                      >
                        <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                          <Trophy className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-xs text-muted-foreground font-medium">Track Wins</p>
                      </motion.div>

                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-center"
                      >
                        <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                          <Target className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-xs text-muted-foreground font-medium">Climb Ranks</p>
                      </motion.div>

                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="text-center"
                      >
                        <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                          <Star className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-xs text-muted-foreground font-medium">Earn Glory</p>
                      </motion.div>
                    </div>

                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6 }}
                    >
                      <Link href="/auth">
                        <Button size="lg" className="shadow-lg shadow-primary/20">
                          <LogIn className="mr-2 h-5 w-5" />
                          Sign In to Compete
                        </Button>
                      </Link>
                      <p className="text-xs text-muted-foreground mt-3">
                        Join the competition and make your mark!
                      </p>
                    </motion.div>
                  </>
                ) : (
                  <>
                    <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                      The leaderboard is empty. Be the first champion! Complete a game and claim your legendary status.
                    </p>
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="pt-4"
                    >
                      <Link href="/game/new">
                        <Button size="lg" className="shadow-lg shadow-primary/20">
                          <Trophy className="mr-2 h-5 w-5" />
                          Start Your First Game
                        </Button>
                      </Link>
                    </motion.div>
                  </>
                )}
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Top 3 Podium (optional - can be expanded later) */}
      {entries.length >= 3 && (
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-6"
          >
            <h2 className="text-2xl font-bold mb-2">Top Players</h2>
            <p className="text-muted-foreground">
              Champions of Killer Pool
            </p>
          </motion.div>
        </div>
      )}

      {/* Leaderboard List */}
      <div className="space-y-3">
        {entries.map((entry) => (
          <LeaderboardCard
            key={entry.player_id}
            entry={entry}
          />
        ))}
      </div>

      {/* Footer Info */}
      {entries.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          Showing top {entries.length} player{entries.length !== 1 ? 's' : ''}
        </motion.div>
      )}
    </div>
  )
}
