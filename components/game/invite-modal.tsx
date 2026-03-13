'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Copy, Download, Share2, Check, QrCode as QrCodeIcon, Loader2, AlertCircle } from 'lucide-react'
import { generateInviteLink, generateInviteQRCode, downloadQRCode, shareInviteLink, copyInviteLink } from '@/lib/invite'
import { useGame } from '@/contexts/game-context'

interface InviteModalProps {
  gameId: string
  gameName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteModal({ gameId, gameName, open, onOpenChange }: InviteModalProps) {
  const { enableSharing, isSharingEnabled, isSpectatorMode } = useGame()
  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState<string>('')
  const [copied, setCopied] = React.useState(false)
  const [isSharing, setIsSharing] = React.useState(false)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [syncError, setSyncError] = React.useState<string | null>(null)
  const inviteLink = generateInviteLink(gameId)

  // Enable sharing when modal opens (syncs game to Supabase)
  // Skip for spectators - the game is already in Supabase
  React.useEffect(() => {
    if (open && !isSharingEnabled && !isSpectatorMode) {
      console.log('[InviteModal] Opening, attempting to enable sharing...')
      setIsSyncing(true)
      setSyncError(null)

      enableSharing()
        .then((success) => {
          console.log('[InviteModal] enableSharing result:', success)
          if (!success) {
            setSyncError('Failed to enable live sharing. Check console for details. You may need to apply the database migration.')
          }
        })
        .catch((error) => {
          console.error('[InviteModal] Error enabling sharing:', error)
          setSyncError(`Failed to enable live sharing: ${error instanceof Error ? error.message : 'Unknown error'}`)
        })
        .finally(() => {
          setIsSyncing(false)
        })
    }
  }, [open, isSharingEnabled, enableSharing, isSpectatorMode])

  React.useEffect(() => {
    if (open) {
      generateInviteQRCode(gameId)
        .then(setQrCodeDataUrl)
        .catch(console.error)
    }
  }, [gameId, open])

  const handleCopy = async () => {
    const success = await copyInviteLink(gameId)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    setIsSharing(true)
    const success = await shareInviteLink(gameId, gameName)
    if (success && !navigator.share) {
      // If Web Share API not available, show copied message
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    setIsSharing(false)
  }

  const handleDownloadQR = async () => {
    try {
      await downloadQRCode(gameId)
    } catch (error) {
      console.error('Failed to download QR code:', error)
      alert('Failed to download QR code')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCodeIcon className="h-5 w-5" />
            Invite Players
          </DialogTitle>
          <DialogDescription>
            Share this link or QR code to invite players to watch the game live
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sync Status */}
          {isSyncing && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Enabling live sharing...</span>
            </div>
          )}

          {syncError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{syncError}</span>
            </div>
          )}

          {/* For spectators, always show that sharing is active (game is already in Supabase) */}
          {(isSharingEnabled || isSpectatorMode) && !isSyncing && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <Check className="h-4 w-4" />
              <span className="text-sm">
                {isSpectatorMode
                  ? 'Share this link to let others watch the game live!'
                  : 'Live sharing enabled! Spectators will see real-time updates.'}
              </span>
            </div>
          )}

          {/* QR Code */}
          {qrCodeDataUrl && (
            <div className="flex flex-col items-center gap-3 p-4 bg-muted rounded-lg">
              <a
                href={inviteLink}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer hover:opacity-80 transition-opacity"
                title="Click to open invite link"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeDataUrl}
                  alt="Game Invite QR Code"
                  className="w-48 h-48 sm:w-64 sm:h-64 rounded-lg"
                />
              </a>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadQR}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Download QR Code
              </Button>
            </div>
          )}

          {/* Invite Link */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Invite Link</label>
            <div className="flex gap-2">
              <Input
                value={inviteLink}
                readOnly
                className="flex-1"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                disabled={copied}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="default"
              className="flex-1"
              onClick={handleShare}
              disabled={isSharing}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share Link
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-md">
            <p className="font-semibold">How to use:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Share the link or QR code with other players</li>
              <li>They can scan the QR code or open the link</li>
              <li>They&apos;ll be taken directly to the game</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
