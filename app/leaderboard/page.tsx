import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeaderboardList } from '@/components/leaderboard/leaderboard-list'

export const metadata: Metadata = {
  title: 'Leaderboard | Killerpool',
  description: 'Top players in Killer Pool - See who dominates the table',
  openGraph: {
    title: 'Leaderboard | Killerpool',
    description: 'Top players in Killer Pool - See who dominates the table',
  },
}

export default function LeaderboardPage() {
  return (
    <main className="min-h-screen p-4 sm:p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Leaderboard</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Top players of Killer Pool</p>
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard List */}
        <LeaderboardList limit={15} />
      </div>
    </main>
  )
}
