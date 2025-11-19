'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LeaderboardCard, LeaderboardEntry } from './leaderboard-card'
import { Card, CardContent } from '@/components/ui/card'
import { Trophy, TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'

interface LeaderboardListProps {
  limit?: number
  className?: string
}

export function LeaderboardList({ limit = 15, className }: LeaderboardListProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLeaderboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit])

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
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Trophy className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Players Yet</h3>
              <p className="text-muted-foreground">
                Be the first to complete a game and claim your spot on the leaderboard!
              </p>
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
