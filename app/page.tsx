'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGame } from '@/contexts/game-context'
import { motion } from 'framer-motion'
import { Play, History, Trophy, Users, UserCircle, LogIn } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function Home() {
  const { game, isLoading } = useGame()
  const hasActiveGame = game && game.status === 'active'
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setAuthLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(16,185,129,0.1),transparent)]" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Auth button - top right */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute top-0 right-0 -mt-16 sm:-mt-12"
        >
          {!authLoading && (
            user ? (
              <Link href="/profile">
                <Button variant="outline" size="lg">
                  <UserCircle className="mr-2 h-5 w-5" />
                  Profile
                </Button>
              </Link>
            ) : (
              <Link href="/auth">
                <Button variant="outline" size="lg">
                  <LogIn className="mr-2 h-5 w-5" />
                  Sign In
                </Button>
              </Link>
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
          <h1 className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-600 bg-clip-text text-transparent mb-4">
            Killerpool
          </h1>
          <p className="text-xl text-muted-foreground">
            Modern Killer Pool For You And Your Friends
          </p>
        </motion.div>

        {/* Resume game banner */}
        {hasActiveGame && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8"
          >
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <Play className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Game in Progress</h3>
                      <p className="text-sm text-muted-foreground">
                        {game.players.filter(p => !p.eliminated).length} players remaining
                      </p>
                    </div>
                  </div>
                  <Link href={`/game/${game.id}`}>
                    <Button size="lg">
                      Resume
                    </Button>
                  </Link>
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
          <Link href="/game/new" className="w-full">
            <Button size="xl" className="w-full h-20 text-lg shadow-lg shadow-primary/20">
              <Users className="mr-3 h-6 w-6" />
              Start New Game
            </Button>
          </Link>

          <div className="grid grid-cols-2 gap-4">
            <Link href="/history" className="w-full">
              <Button variant="outline" size="lg" className="w-full h-16">
                <History className="mr-2 h-5 w-5" />
                History
              </Button>
            </Link>

            <Link href="/stats" className="w-full">
              <Button variant="outline" size="lg" className="w-full h-16">
                <Trophy className="mr-2 h-5 w-5" />
                Stats
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Rules card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3">Classic Rules</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-red-500">-1</div>
                  <div className="text-xs text-muted-foreground">MISS</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-400">0</div>
                  <div className="text-xs text-muted-foreground">POT</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-500">+1</div>
                  <div className="text-xs text-muted-foreground">POT BLACK</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4 text-center">
                3 starting lives • Last player standing wins
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </main>
  )
}
