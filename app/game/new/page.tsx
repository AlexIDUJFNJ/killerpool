'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useGame } from '@/contexts/game-context'
import { createGame } from '@/lib/game-logic'
import { DEFAULT_AVATARS, DEFAULT_RULESET } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getGuestId, getPlayerNamesSuggestions, loadRematchPlayers } from '@/lib/storage'
import { cn, shuffle } from '@/lib/utils'
import { motion } from 'motion/react'
import { Plus, Trash2, ArrowLeft, Play, Shuffle } from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

/**
 * A row in the form. `rowId` is a stable identity so that Shuffle, removal and
 * the empty-name filter can reorder rows without anything that points at a row
 * (the "it's me" marker, the avatar picker, autocomplete) following the wrong
 * one. Ids come from a counter rather than crypto.randomUUID() so server and
 * client render the same markup.
 */
interface PlayerDraft {
  rowId: string
  name: string
  avatar: string
}

export default function NewGamePage() {
  const router = useRouter()
  const { startGame } = useGame()

  const [players, setPlayers] = React.useState<PlayerDraft[]>([
    { rowId: 'p0', name: '', avatar: DEFAULT_AVATARS[0] },
    { rowId: 'p1', name: '', avatar: DEFAULT_AVATARS[1] },
  ])
  // Row belonging to whoever is creating the game. Only this player gets the
  // userId, and achievements, the leaderboard and /stats all key off it — so
  // it is tracked by row id, never by position.
  const [meRowId, setMeRowId] = React.useState<string | null>('p0')
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null)
  const [user, setUser] = React.useState<User | null>(null)
  const [playerSuggestions, setPlayerSuggestions] = React.useState<string[]>([])
  const [activeSuggestionRowId, setActiveSuggestionRowId] = React.useState<string | null>(null)
  const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([])
  const nextRowId = React.useRef(2)

  React.useEffect(() => {
    const supabase = createClient()

    // Check for rematch players first (takes priority over pre-filling)
    const rematchPlayers = loadRematchPlayers()
    const usedRematch = !!rematchPlayers && rematchPlayers.length >= 2
    if (usedRematch) {
      const drafts = rematchPlayers.map(p => ({
        rowId: `p${nextRowId.current++}`,
        name: p.name,
        avatar: p.avatar,
      }))
      setPlayers(drafts)
      const ownerIndex = rematchPlayers.findIndex(p => p.isOwner)
      setMeRowId(ownerIndex >= 0 ? drafts[ownerIndex].rowId : null)
    }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (!user || usedRematch) return

      const { data: profile } = await supabase
        .from('player_profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .single()

      // Pre-fill the first player with the user's name, keeping its rowId —
      // the "it's me" marker points at that id
      if (profile?.display_name) {
        setPlayers(prev => [{ ...prev[0], name: profile.display_name }, ...prev.slice(1)])
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    // Load player name suggestions from history
    const suggestions = getPlayerNamesSuggestions()
    setPlayerSuggestions(suggestions)

    return () => subscription.unsubscribe()
  }, [])

  const handleAddPlayer = () => {
    const nextAvatar = DEFAULT_AVATARS[players.length % DEFAULT_AVATARS.length]
    setPlayers([...players, { rowId: `p${nextRowId.current++}`, name: '', avatar: nextAvatar }])
  }

  const handleRemovePlayer = (rowId: string) => {
    if (players.length > 2) {
      setPlayers(players.filter(p => p.rowId !== rowId))
      if (meRowId === rowId) {
        setMeRowId(null)
      }
    }
  }

  const handleNameChange = (rowId: string, name: string) => {
    setPlayers(prev => prev.map(p => (p.rowId === rowId ? { ...p, name } : p)))

    // Update filtered suggestions for autocomplete
    if (name.trim()) {
      const filtered = playerSuggestions.filter(suggestion =>
        suggestion.toLowerCase().includes(name.toLowerCase()) &&
        suggestion.toLowerCase() !== name.toLowerCase()
      )
      setFilteredSuggestions(filtered)
      setActiveSuggestionRowId(rowId)
    } else {
      setFilteredSuggestions([])
      setActiveSuggestionRowId(null)
    }
  }

  const handleSelectSuggestion = (rowId: string, suggestion: string) => {
    setPlayers(prev => prev.map(p => (p.rowId === rowId ? { ...p, name: suggestion } : p)))
    setFilteredSuggestions([])
    setActiveSuggestionRowId(null)
  }

  const handleAvatarSelect = (avatar: string) => {
    if (selectedRowId !== null) {
      setPlayers(prev => prev.map(p => (p.rowId === selectedRowId ? { ...p, avatar } : p)))
      setSelectedRowId(null)
    }
  }

  const handleShuffle = () => {
    setPlayers(shuffle(players))
  }

  const handleStartGame = () => {
    // Validate
    const validPlayers = players.filter(p => p.name.trim().length > 0)
    if (validPlayers.length < 2) {
      alert('Please add at least 2 players with names')
      return
    }

    // Never guess who the creator is. A wrong guess hands their achievements
    // and their leaderboard entry to another player, and that is not reversible
    if (meRowId !== null && !validPlayers.some(p => p.rowId === meRowId)) {
      alert('Enter your own name, or mark which player is you')
      return
    }

    // Use userId if authenticated, otherwise use stable guest_id
    const userId = user?.id || getGuestId()
    const game = createGame(
      validPlayers.map(p => ({ name: p.name, avatar: p.avatar, isOwner: p.rowId === meRowId })),
      DEFAULT_RULESET,
      meRowId === null ? null : userId
    )
    startGame(game)

    // Navigate to game
    router.push(`/game/${game.id}`)
  }

  const canStartGame = players.filter(p => p.name.trim().length > 0).length >= 2

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold">New Game</h1>
        </div>

        {/* Players */}
        <div className="space-y-4 mb-6">
          {players.map((player, index) => (
            <motion.div
              key={player.rowId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <button
                      onClick={() => setSelectedRowId(player.rowId)}
                      className="shrink-0"
                    >
                      <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-primary/20 cursor-pointer hover:border-primary transition-colors">
                        <AvatarFallback className="text-2xl sm:text-3xl bg-primary/10">
                          {player.avatar}
                        </AvatarFallback>
                      </Avatar>
                    </button>

                    <div className="flex-1 min-w-0 relative">
                      <input
                        type="text"
                        placeholder={`Player ${index + 1} name`}
                        value={player.name}
                        onChange={(e) => handleNameChange(player.rowId, e.target.value)}
                        onFocus={() => {
                          if (player.name.trim() && filteredSuggestions.length > 0) {
                            setActiveSuggestionRowId(player.rowId)
                          }
                        }}
                        onBlur={() => {
                          // Delay to allow click on suggestion
                          setTimeout(() => setActiveSuggestionRowId(null), 200)
                        }}
                        className="w-full bg-background border border-input rounded-md px-3 py-3 text-base sm:text-lg sm:px-4 focus:outline-hidden focus:ring-2 focus:ring-ring"
                        maxLength={20}
                      />

                      {/* Autocomplete Suggestions */}
                      {activeSuggestionRowId === player.rowId && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filteredSuggestions.slice(0, 5).map((suggestion, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleSelectSuggestion(player.rowId, suggestion)}
                              className="w-full px-4 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Which row is the person creating the game. Only this
                        player carries the userId that achievements, the
                        leaderboard and /stats are keyed on. */}
                    <button
                      type="button"
                      onClick={() =>
                        setMeRowId(current => (current === player.rowId ? null : player.rowId))
                      }
                      aria-pressed={meRowId === player.rowId}
                      title={meRowId === player.rowId ? 'This is you' : 'Mark this player as you'}
                      className={cn(
                        'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        meRowId === player.rowId
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {meRowId === player.rowId ? 'You' : 'Me?'}
                    </button>

                    {players.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemovePlayer(player.rowId)}
                      >
                        <Trash2 className="h-5 w-5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Button
          variant="outline"
          className="w-full h-14 mb-8"
          onClick={handleAddPlayer}
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Player ({players.length})
        </Button>

        {selectedRowId !== null && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle>
                  Select Avatar for Player{' '}
                  {players.findIndex(p => p.rowId === selectedRowId) + 1}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 sm:gap-2">
                  {DEFAULT_AVATARS.map((avatar) => (
                    <button
                      key={avatar}
                      onClick={() => handleAvatarSelect(avatar)}
                      className="aspect-square flex items-center justify-center text-xl sm:text-2xl hover:bg-primary/10 rounded-lg transition-colors border-2 border-transparent hover:border-primary"
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => setSelectedRowId(null)}
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Shuffle Button */}
        {canStartGame && (
          <Button
            variant="outline"
            size="lg"
            className="w-full h-14 text-base mb-4 border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10 hover:text-yellow-600 hover:border-yellow-500"
            onClick={handleShuffle}
          >
            <Shuffle className="mr-2 h-5 w-5" />
            Shuffle Players
          </Button>
        )}

        <Button
          size="xl"
          className="w-full h-16 text-lg shadow-lg"
          onClick={handleStartGame}
          disabled={!canStartGame}
        >
          <Play className="mr-3 h-6 w-6" />
          Start Game
        </Button>

        {!canStartGame && (
          <p className="text-sm text-muted-foreground text-center mt-4">
            Add at least 2 players with names to start
          </p>
        )}
      </div>
    </main>
  )
}
