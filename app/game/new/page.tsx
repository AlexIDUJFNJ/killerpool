'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useGame } from '@/contexts/game-context'
import { createGame } from '@/lib/game-logic'
import { DEFAULT_AVATARS, DEFAULT_RULESET } from '@/lib/types'
import { motion } from 'framer-motion'
import { Plus, Trash2, ArrowLeft, Play } from 'lucide-react'
import Link from 'next/link'

export default function NewGamePage() {
  const router = useRouter()
  const { startGame } = useGame()

  const [players, setPlayers] = React.useState([
    { name: '', avatar: DEFAULT_AVATARS[0] },
    { name: '', avatar: DEFAULT_AVATARS[1] },
  ])
  const [selectedPlayerIndex, setSelectedPlayerIndex] = React.useState<number | null>(null)

  const handleAddPlayer = () => {
    if (players.length < 8) {
      const nextAvatar = DEFAULT_AVATARS[players.length % DEFAULT_AVATARS.length]
      setPlayers([...players, { name: '', avatar: nextAvatar }])
    }
  }

  const handleRemovePlayer = (index: number) => {
    if (players.length > 2) {
      setPlayers(players.filter((_, i) => i !== index))
    }
  }

  const handleNameChange = (index: number, name: string) => {
    const updated = [...players]
    updated[index].name = name
    setPlayers(updated)
  }

  const handleAvatarSelect = (avatar: string) => {
    if (selectedPlayerIndex !== null) {
      const updated = [...players]
      updated[selectedPlayerIndex].avatar = avatar
      setPlayers(updated)
      setSelectedPlayerIndex(null)
    }
  }

  const handleStartGame = () => {
    // Validate
    const validPlayers = players.filter(p => p.name.trim().length > 0)
    if (validPlayers.length < 2) {
      alert('Please add at least 2 players with names')
      return
    }

    // Create game
    const game = createGame(validPlayers, DEFAULT_RULESET)
    startGame(game)

    // Navigate to game
    router.push(`/game/${game.id}`)
  }

  const canStartGame = players.filter(p => p.name.trim().length > 0).length >= 2

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">New Game</h1>
        </div>

        {/* Players */}
        <div className="space-y-4 mb-6">
          {players.map((player, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setSelectedPlayerIndex(index)}
                      className="shrink-0"
                    >
                      <Avatar className="h-16 w-16 border-2 border-primary/20 cursor-pointer hover:border-primary transition-colors">
                        <AvatarFallback className="text-3xl bg-primary/10">
                          {player.avatar}
                        </AvatarFallback>
                      </Avatar>
                    </button>

                    <input
                      type="text"
                      placeholder={`Player ${index + 1} name`}
                      value={player.name}
                      onChange={(e) => handleNameChange(index, e.target.value)}
                      className="flex-1 bg-background border border-input rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-ring"
                      maxLength={20}
                    />

                    {players.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemovePlayer(index)}
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

        {players.length < 8 && (
          <Button
            variant="outline"
            className="w-full h-14 mb-8"
            onClick={handleAddPlayer}
          >
            <Plus className="mr-2 h-5 w-5" />
            Add Player ({players.length}/8)
          </Button>
        )}

        {selectedPlayerIndex !== null && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle>Select Avatar for Player {selectedPlayerIndex + 1}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-8 gap-2">
                  {DEFAULT_AVATARS.map((avatar) => (
                    <button
                      key={avatar}
                      onClick={() => handleAvatarSelect(avatar)}
                      className="aspect-square flex items-center justify-center text-2xl hover:bg-primary/10 rounded-lg transition-colors border-2 border-transparent hover:border-primary"
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => setSelectedPlayerIndex(null)}
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          </motion.div>
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
