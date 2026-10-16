'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { Trophy, TrendingUp } from 'lucide-react'

export interface LeaderboardEntry {
  player_id: string
  display_name: string
  avatar_url: string | null
  total_games: number
  games_won: number
  games_lost: number
  win_rate: number
  total_actions: number
  total_black_pots: number
  rank: number
}

export interface LeaderboardCardProps {
  entry: LeaderboardEntry
  className?: string
}

/** Only http(s) URLs are treated as images; anything else falls back to initials */
export function getAvatarImageUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null
  try {
    const url = new URL(avatarUrl.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/** "Jane Doe" → "JD", "jane.doe" → "JD", "alex" → "A" */
export function getInitials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase()
}

function PlayerAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const imageUrl = getAvatarImageUrl(avatarUrl)
  // A broken or blocked image falls back to initials rather than an empty circle
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null)
  const showImage = imageUrl !== null && failedUrl !== imageUrl

  return (
    <Avatar className="h-14 w-14 border-2 border-primary/20">
      {showImage ? (
        <AvatarImage
          src={imageUrl}
          // The name is right next to it, so the picture is decorative
          alt=""
          className="object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary" aria-hidden="true">
          {getInitials(name)}
        </AvatarFallback>
      )}
    </Avatar>
  )
}

export function LeaderboardCard({ entry, className }: LeaderboardCardProps) {
  const { rank, display_name, avatar_url, total_games, games_won, win_rate } = entry

  // Medal colors for top 3
  const getMedalColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'text-yellow-500' // Gold
      case 2:
        return 'text-gray-400' // Silver
      case 3:
        return 'text-amber-600' // Bronze
      default:
        return 'text-muted-foreground'
    }
  }

  const isTopThree = rank <= 3

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: rank * 0.05 }}
      className={className}
    >
      <Card
        className={cn(
          'relative overflow-hidden transition-all hover:shadow-md',
          isTopThree && 'ring-2 ring-primary/20 shadow-lg'
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Rank Number / Medal */}
            <div className="shrink-0 w-12 flex items-center justify-center">
              <span className="sr-only">Rank {rank}</span>
              {isTopThree ? (
                <Trophy className={cn('h-8 w-8', getMedalColor(rank))} />
              ) : (
                <span className="text-2xl font-bold text-muted-foreground" aria-hidden="true">
                  {rank}
                </span>
              )}
            </div>

            {/* Avatar */}
            <PlayerAvatar name={display_name} avatarUrl={avatar_url} />

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-lg truncate">{display_name}</h3>
                {isTopThree && (
                  <Badge
                    aria-hidden="true"
                    variant="default"
                    className={cn(
                      'text-xs px-2 py-0',
                      rank === 1 && 'bg-yellow-500 hover:bg-yellow-600',
                      rank === 2 && 'bg-gray-400 hover:bg-gray-500',
                      rank === 3 && 'bg-amber-600 hover:bg-amber-700'
                    )}
                  >
                    #{rank}
                  </Badge>
                )}
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  <span className="font-semibold text-green-500">
                    {win_rate.toFixed(1)}%
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {games_won}W / {entry.games_lost}L
                </div>
                <div className="text-muted-foreground">
                  {total_games} games
                </div>
              </div>
            </div>

            {/* Win Rate Badge */}
            <div className="shrink-0 text-right">
              <Badge
                variant="secondary"
                className={cn(
                  'font-bold text-base px-3 py-1',
                  win_rate >= 70 && 'bg-green-500/20 text-green-600',
                  win_rate >= 50 && win_rate < 70 && 'bg-blue-500/20 text-blue-600',
                  win_rate < 50 && 'bg-orange-500/20 text-orange-600'
                )}
              >
                {win_rate.toFixed(0)}%
              </Badge>
            </div>
          </div>

          {/* Top 3 Gradient Bar */}
          {isTopThree && (
            <motion.div
              className={cn(
                'absolute top-0 left-0 h-full w-1',
                rank === 1 && 'bg-linear-to-b from-yellow-500 to-yellow-600',
                rank === 2 && 'bg-linear-to-b from-gray-400 to-gray-500',
                rank === 3 && 'bg-linear-to-b from-amber-600 to-amber-700'
              )}
              layoutId={`rank-indicator-${rank}`}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
