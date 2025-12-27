/**
 * Game Logic for Killerpool
 * 
 * Core game functions for managing Killer Pool games.
 */

import { Game, Player, GameAction, GameHistoryEntry, Ruleset, DEFAULT_RULESET } from './types'

/**
 * Create a new player
 */
export function createPlayer(
  name: string,
  avatar: string,
  startingLives: number,
  userId?: string | null
): Player {
  return {
    id: crypto.randomUUID(),
    name,
    avatar,
    lives: startingLives,
    eliminated: false,
    userId,
  }
}

/**
 * Create a new game
 */
export function createGame(
  players: Array<{ name: string; avatar: string }>,
  ruleset: Ruleset = DEFAULT_RULESET,
  userId?: string | null
): Game {
  // Only assign userId to the first player (the authenticated user)
  // Other players should have null userId so they're tracked by their unique player_id
  const gamePlayers = players.map((p, index) =>
    createPlayer(p.name, p.avatar, ruleset.params.starting_lives, index === 0 ? userId : null)
  )

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
    players: gamePlayers,
    currentPlayerIndex: 0,
    ruleset,
    rulesetId: ruleset.id,
    history: [],
    createdBy: userId,
  }
}

/**
 * Apply a game action to the current player
 */
export function applyAction(game: Game, action: GameAction): Game {
  const currentPlayer = game.players[game.currentPlayerIndex]
  
  if (!currentPlayer || currentPlayer.eliminated) {
    throw new Error('Invalid player state')
  }

  // Calculate lives change
  const livesChange = game.ruleset.params[action]
  const livesBefore = currentPlayer.lives
  let livesAfter = livesBefore + livesChange

  // Respect max lives limit
  const maxLives = game.ruleset.params.max_lives || 6
  livesAfter = Math.min(livesAfter, maxLives)

  // Check if player is eliminated
  const isEliminated = livesAfter <= 0

  // Create history entry
  const historyEntry: GameHistoryEntry = {
    id: crypto.randomUUID(),
    action,
    playerId: currentPlayer.id,
    playerName: currentPlayer.name,
    timestamp: new Date().toISOString(),
    livesBefore,
    livesAfter: Math.max(0, livesAfter),
  }

  // Update player
  const updatedPlayers = game.players.map(p =>
    p.id === currentPlayer.id
      ? { ...p, lives: Math.max(0, livesAfter), eliminated: isEliminated }
      : p
  )

  // Find next active player
  const nextPlayerIndex = findNextActivePlayer(updatedPlayers, game.currentPlayerIndex)

  // Check for winner
  const activePlayers = updatedPlayers.filter(p => !p.eliminated)
  const winnerId = activePlayers.length === 1 ? activePlayers[0].id : undefined
  const gameStatus = winnerId ? 'completed' : 'active'

  return {
    ...game,
    players: updatedPlayers,
    currentPlayerIndex: nextPlayerIndex,
    winnerId,
    status: gameStatus,
    history: [...game.history, historyEntry],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Find the next active (non-eliminated) player
 */
function findNextActivePlayer(players: Player[], currentIndex: number): number {
  const totalPlayers = players.length
  let nextIndex = (currentIndex + 1) % totalPlayers
  let attempts = 0

  while (attempts < totalPlayers) {
    if (!players[nextIndex].eliminated) {
      return nextIndex
    }
    nextIndex = (nextIndex + 1) % totalPlayers
    attempts++
  }

  // If no active players found, stay at current
  return currentIndex
}

/**
 * Get the current active player
 */
export function getCurrentPlayer(game: Game): Player | undefined {
  return game.players[game.currentPlayerIndex]
}

/**
 * Get active (non-eliminated) players
 */
export function getActivePlayers(game: Game): Player[] {
  return game.players.filter(p => !p.eliminated)
}

/**
 * Get eliminated players
 */
export function getEliminatedPlayers(game: Game): Player[] {
  return game.players.filter(p => p.eliminated)
}

/**
 * Get the next N players in the queue (after current player)
 */
export function getNextPlayers(game: Game, count: number = 2): Player[] {
  const totalPlayers = game.players.length
  const nextPlayers: Player[] = []
  const currentIndex = game.currentPlayerIndex
  let found = 0

  for (let i = 0; i < totalPlayers && found < count; i++) {
    const nextIndex = (currentIndex + 1 + i) % totalPlayers
    const player = game.players[nextIndex]

    if (!player.eliminated) {
      nextPlayers.push(player)
      found++
    }
  }

  return nextPlayers
}

/**
 * Get the winner if game is completed
 */
export function getWinner(game: Game): Player | undefined {
  if (game.status !== 'completed' || !game.winnerId) {
    return undefined
  }
  return game.players.find(p => p.id === game.winnerId)
}

/**
 * Undo last action
 */
export function undoLastAction(game: Game): Game {
  if (game.history.length === 0) {
    return game
  }

  const lastEntry = game.history[game.history.length - 1]
  const updatedHistory = game.history.slice(0, -1)

  // Restore player state
  const updatedPlayers = game.players.map(p =>
    p.id === lastEntry.playerId
      ? { ...p, lives: lastEntry.livesBefore, eliminated: lastEntry.livesBefore <= 0 }
      : p
  )

  // Find the player who performed the undone action
  const playerIndex = updatedPlayers.findIndex(p => p.id === lastEntry.playerId)

  // Recalculate current player and winner
  const activePlayers = updatedPlayers.filter(p => !p.eliminated)
  const winnerId = activePlayers.length === 1 ? activePlayers[0].id : undefined

  return {
    ...game,
    players: updatedPlayers,
    currentPlayerIndex: playerIndex >= 0 ? playerIndex : game.currentPlayerIndex,
    winnerId,
    status: winnerId ? 'completed' : 'active',
    history: updatedHistory,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Add a new player to an active game
 * The new player gets the minimum lives among all active players
 */
export function addPlayerToGame(
  game: Game,
  playerName: string,
  playerAvatar: string
): Game {
  if (game.status !== 'active') {
    throw new Error('Cannot add player to a non-active game')
  }

  const activePlayers = getActivePlayers(game)

  if (activePlayers.length === 0) {
    throw new Error('No active players in game')
  }

  // Get minimum lives among active players
  const minLives = Math.min(...activePlayers.map(p => p.lives))

  // Create new player with minimum lives
  const newPlayer = createPlayer(playerName, playerAvatar, minLives, null)

  // Add player to the end of the players array
  const updatedPlayers = [...game.players, newPlayer]

  return {
    ...game,
    players: updatedPlayers,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Get players sorted by status (active first, eliminated last)
 */
export function getSortedPlayers(game: Game): Player[] {
  const activePlayers = game.players.filter(p => !p.eliminated)
  const eliminatedPlayers = game.players.filter(p => p.eliminated)
  return [...activePlayers, ...eliminatedPlayers]
}

/**
 * Calculate game statistics
 */
export function calculateStats(game: Game) {
  const totalActions = game.history.length
  const totalMisses = game.history.filter(h => h.action === 'miss').length
  const totalPots = game.history.filter(h => h.action === 'pot').length
  const totalBlackPots = game.history.filter(h => h.action === 'pot_black').length

  const duration = game.status === 'completed'
    ? new Date(game.updatedAt).getTime() - new Date(game.createdAt).getTime()
    : undefined

  const winner = getWinner(game)

  return {
    totalActions,
    totalMisses,
    totalPots,
    totalBlackPots,
    duration,
    winner,
  }
}
