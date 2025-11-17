/**
 * Invite utilities for Killerpool
 *
 * Handles creating invite links and QR codes for games
 */

import QRCode from 'qrcode'
import { Game } from './types'

/**
 * Generate an invite link for a game
 */
export function generateInviteLink(gameId: string): string {
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || 'https://killerpool.app'

  return `${baseUrl}/game/${gameId}?invite=true`
}

/**
 * Generate a QR code data URL for a game invite
 */
export async function generateInviteQRCode(gameId: string): Promise<string> {
  const inviteLink = generateInviteLink(gameId)

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(inviteLink, {
      width: 300,
      margin: 2,
      color: {
        dark: '#10b981', // emerald-500
        light: '#000000',
      },
    })

    return qrCodeDataUrl
  } catch (error) {
    console.error('Failed to generate QR code:', error)
    throw error
  }
}

/**
 * Download QR code as an image
 */
export async function downloadQRCode(gameId: string, filename?: string): Promise<void> {
  try {
    const qrCodeDataUrl = await generateInviteQRCode(gameId)

    const link = document.createElement('a')
    link.href = qrCodeDataUrl
    link.download = filename || `killerpool-invite-${gameId.slice(0, 8)}.png`

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    console.log('QR code downloaded successfully')
  } catch (error) {
    console.error('Failed to download QR code:', error)
    throw error
  }
}

/**
 * Share invite link using Web Share API or copy to clipboard
 */
export async function shareInviteLink(gameId: string, gameName?: string): Promise<boolean> {
  const inviteLink = generateInviteLink(gameId)

  // Try Web Share API first
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Join Killerpool Game',
        text: gameName
          ? `Join "${gameName}" on Killerpool!`
          : 'Join my Killerpool game!',
        url: inviteLink,
      })
      console.log('Invite link shared successfully')
      return true
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Share cancelled by user')
      } else {
        console.error('Error sharing invite link:', error)
      }
    }
  }

  // Fallback to copying to clipboard
  try {
    await navigator.clipboard.writeText(inviteLink)
    console.log('Invite link copied to clipboard')
    return true
  } catch (error) {
    console.error('Failed to copy invite link:', error)
    return false
  }
}

/**
 * Copy invite link to clipboard
 */
export async function copyInviteLink(gameId: string): Promise<boolean> {
  const inviteLink = generateInviteLink(gameId)

  try {
    await navigator.clipboard.writeText(inviteLink)
    console.log('Invite link copied to clipboard')
    return true
  } catch (error) {
    console.error('Failed to copy invite link:', error)
    return false
  }
}
