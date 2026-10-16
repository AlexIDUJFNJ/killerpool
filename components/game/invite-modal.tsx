'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const [sharingFailed, setSharingFailed] = React.useState(false)
  const [downloadFailed, setDownloadFailed] = React.useState(false)
  // "Try again" bumps this to run the sharing effect once more
  const [attempt, setAttempt] = React.useState(0)
  const inviteLink = generateInviteLink(gameId)
  const linkInputId = React.useId()

  // Opening the modal uploads the game so the link can show it live.
  // Spectators skip this: the game is already in Supabase.
  const needsSharing = open && !isSharingEnabled && !isSpectatorMode
  const isSyncing = needsSharing && !sharingFailed
  // The link is held back until the host's first write has landed. Inserting a
  // guest game is open to anyone, and that first row fixes the host-secret hash
  // (00016): whoever got the id into the database first would own the game.
  const canShare = isSharingEnabled || isSpectatorMode

  // enableSharing changes identity with every game update; reading it from a
  // ref keys the effect on intent (open, retry) instead of on each shot played
  const enableSharingRef = React.useRef(enableSharing)
  React.useEffect(() => {
    enableSharingRef.current = enableSharing
  }, [enableSharing])

  React.useEffect(() => {
    if (!needsSharing) return
    let cancelled = false

    enableSharingRef.current()
      .then((success) => {
        // The cause (network, permissions) is logged by enableSharing
        if (!cancelled && !success) setSharingFailed(true)
      })
      .catch((error) => {
        console.error('[InviteModal] Error enabling sharing:', error)
        if (!cancelled) setSharingFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [needsSharing, attempt])

  const handleOpenChange = (nextOpen: boolean) => {
    // Reopening tries again from a clean slate
    if (!nextOpen) setSharingFailed(false)
    onOpenChange(nextOpen)
  }

  const retrySharing = () => {
    setSharingFailed(false)
    setAttempt((n) => n + 1)
  }

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
    setDownloadFailed(false)
    try {
      await downloadQRCode(gameId)
    } catch (error) {
      console.error('Failed to download QR code:', error)
      setDownloadFailed(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Enabling live sharing...</span>
            </div>
          )}

          {sharingFailed && !isSharingEnabled && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg" role="alert">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-sm">
                  Live sharing couldn&apos;t be turned on, so people opening the link
                  won&apos;t see the game yet. Check your connection and try again.
                </p>
                <Button variant="outline" size="sm" onClick={retrySharing}>
                  Try again
                </Button>
              </div>
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
          {canShare && qrCodeDataUrl && (
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
              {downloadFailed && (
                <p className="text-sm text-destructive" role="alert">
                  The QR code couldn&apos;t be saved. Try again, or share the link instead.
                </p>
              )}
            </div>
          )}

          {canShare && (
            <>
              {/* Invite Link */}
              <div className="space-y-2">
                <Label htmlFor={linkInputId}>Invite Link</Label>
                <div className="flex gap-2">
                  <Input
                    id={linkInputId}
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
                    aria-label={copied ? 'Invite link copied' : 'Copy invite link'}
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
            </>
          )}

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
