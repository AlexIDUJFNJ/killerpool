'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGame } from '@/contexts/game-context'
import { motion } from 'motion/react'
import { Play, History, Trophy, Users, CircleUser, LogIn, Award, CircleHelp } from 'lucide-react'
import { PWAInstallButton } from '@/components/pwa-install-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { ACTION_STYLES, formatLivesDelta } from '@/components/game/action-styles'
import { DEFAULT_RULESET, type GameAction } from '@/lib/types'
import { cn } from '@/lib/utils'

const RULE_ACTIONS: GameAction[] = ['miss', 'pot', 'pot_black']

export default function Home() {
  // Everything on this page but the resume banner is static, so it renders on
  // the server; only the banner waits for the saved game, which lives in
  // localStorage and so is known only after hydration. currentUserId is
  // undefined until GameProvider has read the session, null for a guest.
  const { game, isLoading, currentUserId } = useGame()
  const hasActiveGame = !isLoading && game?.status === 'active'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-linear-to-br from-background via-background to-primary/5" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(16,185,129,0.1),transparent)]" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Auth button - top right */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute top-0 right-0 -mt-16 sm:-mt-12"
        >
          {currentUserId !== undefined && (
            currentUserId ? (
              <Button asChild variant="outline" size="lg">
                <Link href="/profile">
                  <CircleUser className="mr-2 h-5 w-5" />
                  Profile
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="lg">
                <Link href="/auth">
                  <LogIn className="mr-2 h-5 w-5" />
                  Sign In
                </Link>
              </Button>
            )
          )}
        </motion.div>

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold bg-linear-to-r from-emerald-400 via-green-500 to-emerald-600 bg-clip-text text-transparent mb-4">
            Killerpool
          </h1>
          <p className="text-base sm:text-xl text-muted-foreground">
            Modern Killer Pool For You And Your Friends
          </p>
        </motion.div>

        {/* Resume game banner */}
        {hasActiveGame && game && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8"
          >
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Play className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base">Game in Progress</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">
                        {game.players.filter(p => !p.eliminated).length} players remaining
                      </p>
                    </div>
                  </div>
                  <Button asChild className="shrink-0 sm:h-10 sm:px-8">
                    <Link href={`/game/${game.id}`}>Resume</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid gap-4 mb-8"
        >
          <Button asChild size="xl" className="w-full h-20 text-lg shadow-lg shadow-primary/20">
            <Link href="/game/new">
              <Users className="mr-3 h-6 w-6" />
              Start New Game
            </Link>
          </Button>

          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Button asChild variant="outline" size="lg" className="w-full h-14 sm:h-16 px-2 sm:px-4">
              <Link href="/history">
                <History className="h-5 w-5 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">History</span>
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg" className="w-full h-14 sm:h-16 px-2 sm:px-4">
              <Link href="/stats">
                <Trophy className="h-5 w-5 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">Stats</span>
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg" className="w-full h-14 sm:h-16 px-2 sm:px-4">
              <Link href="/leaderboard">
                <Award className="h-5 w-5 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">Top</span>
              </Link>
            </Button>
          </div>
        </motion.div>

        {/* Rules card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h3 className="font-semibold mb-3 text-sm sm:text-base">Classic Rules</h3>
              <dl className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                {RULE_ACTIONS.map((action) => (
                  <div key={action} className="flex flex-col-reverse">
                    <dt className="text-xs text-muted-foreground">{ACTION_STYLES[action].name}</dt>
                    <dd className={cn('text-xl sm:text-2xl font-bold', ACTION_STYLES[action].text)}>
                      {formatLivesDelta(DEFAULT_RULESET.params[action])}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs sm:text-sm text-muted-foreground mt-4 text-center">
                {DEFAULT_RULESET.params.starting_lives} starting lives • Last player standing wins
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Renders nothing unless the app is installable and not installed yet */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-4"
        >
          <PWAInstallButton className="w-full h-14" />
        </motion.div>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-8 flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between"
        >
          <Link
            href="/help"
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="h-4 w-4" />
            Help &amp; rules
          </Link>
          <ThemeToggle />
        </motion.footer>
      </div>
    </main>
  )
}
