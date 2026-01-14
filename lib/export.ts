/**
 * Export utilities for Killerpool
 *
 * Handles exporting game data to various formats (CSV, Screenshot, Share)
 */

import { Game } from './types'

/**
 * Export game data to CSV format
 */
export function exportGameToCSV(game: Game): void {
  if (!game) {
    console.error('No game data to export')
    return
  }

  const winner = game.players.find(p => p.id === game.winnerId)

  // Create CSV header
  const headers = [
    'Game ID',
    'Date',
    'Duration',
    'Winner',
    'Players',
    'Total Actions',
    'Status',
  ]

  // Game summary row
  const duration = new Date(game.updatedAt).getTime() - new Date(game.createdAt).getTime()
  const minutes = Math.floor(duration / 60000)
  const seconds = Math.floor((duration % 60000) / 1000)

  const summaryRow = [
    game.id,
    new Date(game.createdAt).toLocaleString(),
    `${minutes}m ${seconds}s`,
    winner ? `${winner.name} (${winner.avatar})` : 'N/A',
    game.players.length.toString(),
    game.history.length.toString(),
    game.status,
  ]

  // Player statistics section
  const playerHeaders = [
    '',
    'Player',
    'Avatar',
    'Final Lives',
    'Status',
    'Total Actions',
    'Misses',
    'Pots',
    'Black Pots',
  ]

  const playerRows = game.players.map((player) => {
    const playerHistory = game.history.filter(h => h.playerId === player.id)
    const stats = {
      totalActions: playerHistory.length,
      misses: playerHistory.filter(h => h.action === 'miss').length,
      pots: playerHistory.filter(h => h.action === 'pot').length,
      blackPots: playerHistory.filter(h => h.action === 'pot_black').length,
    }

    return [
      '',
      player.name,
      player.avatar,
      player.lives.toString(),
      player.eliminated ? 'Eliminated' : player.id === game.winnerId ? 'Winner' : 'Active',
      stats.totalActions.toString(),
      stats.misses.toString(),
      stats.pots.toString(),
      stats.blackPots.toString(),
    ]
  })

  // Action timeline section
  const timelineHeaders = [
    '',
    'Action #',
    'Player',
    'Action',
    'Lives Before',
    'Lives After',
    'Timestamp',
  ]

  const timelineRows = game.history.map((entry, index) => [
    '',
    (game.history.length - index).toString(),
    entry.playerName,
    entry.action.toUpperCase(),
    entry.livesBefore.toString(),
    entry.livesAfter.toString(),
    new Date(entry.timestamp).toLocaleTimeString(),
  ])

  // Combine all sections
  const csvContent = [
    // Game Summary
    ['GAME SUMMARY'],
    headers,
    summaryRow,
    [],
    // Player Statistics
    ['PLAYER STATISTICS'],
    playerHeaders,
    ...playerRows,
    [],
    // Action Timeline
    ['ACTION TIMELINE'],
    timelineHeaders,
    ...timelineRows,
  ]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n')

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', `killerpool-game-${game.id.slice(0, 8)}-${Date.now()}.csv`)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  console.log('Game exported to CSV successfully')
}

/**
 * Export game data as JSON
 */
export function exportGameToJSON(game: Game): void {
  if (!game) {
    console.error('No game data to export')
    return
  }

  const jsonContent = JSON.stringify(game, null, 2)
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', `killerpool-game-${game.id.slice(0, 8)}-${Date.now()}.json`)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  console.log('Game exported to JSON successfully')
}

/**
 * Take a screenshot of the current page
 * Note: This requires html2canvas library to be installed
 */
export async function exportScreenshot(elementId: string, filename?: string): Promise<void> {
  try {
    // Dynamically import html2canvas only when needed
    const html2canvas = (await import('html2canvas')).default

    const element = document.getElementById(elementId) || document.body
    const canvas = await html2canvas(element, {
      backgroundColor: '#000000',
      scale: 2,
      logging: false,
    })

    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create blob from canvas')
        return
      }

      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)

      link.setAttribute('href', url)
      link.setAttribute('download', filename || `killerpool-screenshot-${Date.now()}.png`)
      link.style.visibility = 'hidden'

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      console.log('Screenshot exported successfully')
    })
  } catch (error) {
    console.error('Failed to export screenshot:', error)
    throw error
  }
}

/**
 * Share game data using Web Share API
 */
export async function shareGame(game: Game): Promise<boolean> {
  if (!navigator.share) {
    console.warn('Web Share API not supported')
    return false
  }

  const winner = game.players.find(p => p.id === game.winnerId)
  const shareData = {
    title: 'Killerpool Game Results',
    text: winner
      ? `${winner.avatar} ${winner.name} won the game! Check out the full results.`
      : 'Check out this Killerpool game!',
    url: window.location.href,
  }

  try {
    await navigator.share(shareData)
    console.log('Game shared successfully')
    return true
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.log('Share cancelled by user')
    } else {
      console.error('Error sharing game:', error)
    }
    return false
  }
}

/**
 * Copy game summary to clipboard
 */
export async function copyGameSummary(game: Game): Promise<boolean> {
  const winner = game.players.find(p => p.id === game.winnerId)
  const duration = new Date(game.updatedAt).getTime() - new Date(game.createdAt).getTime()
  const minutes = Math.floor(duration / 60000)
  const seconds = Math.floor((duration % 60000) / 1000)

  const summary = `
🎱 Killerpool Game Results

${winner ? `🏆 Winner: ${winner.avatar} ${winner.name}` : ''}
📅 Date: ${new Date(game.createdAt).toLocaleString()}
⏱️ Duration: ${minutes}m ${seconds}s
👥 Players: ${game.players.length}
🎯 Total Actions: ${game.history.length}

Players:
${game.players.map(p => {
  const playerHistory = game.history.filter(h => h.playerId === p.id)
  return `${p.avatar} ${p.name} - ${p.lives} lives (${playerHistory.length} actions)`
}).join('\n')}
`.trim()

  try {
    await navigator.clipboard.writeText(summary)
    console.log('Game summary copied to clipboard')
    return true
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    return false
  }
}
