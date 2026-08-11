'use client'

import * as React from 'react'
import { Download, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { useInstallPrompt } from '@/hooks/use-install-prompt'
import { promptInstall } from '@/lib/pwa-install'

/**
 * Offers to install the app. Renders nothing unless the browser says the app
 * is installable and it is not installed already, so it can be dropped
 * anywhere without leaving a gap.
 */
export function PWAInstallButton({ className }: { className?: string }) {
  const state = useInstallPrompt()
  const [showIOSHelp, setShowIOSHelp] = React.useState(false)

  if (state === 'installed' || state === 'unavailable') {
    return null
  }

  // Safari has no install prompt to trigger, so point at the share sheet
  if (state === 'ios') {
    return (
      <>
        <Button
          variant="outline"
          size="lg"
          className={className}
          onClick={() => setShowIOSHelp(true)}
        >
          <Download className="mr-2 h-5 w-5" />
          Install App
        </Button>

        <BottomSheet
          isOpen={showIOSHelp}
          onClose={() => setShowIOSHelp(false)}
          title="Install on iPhone or iPad"
        >
          <ol className="space-y-4 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-bold text-primary">1.</span>
              <span className="flex items-center gap-1.5">
                Tap <Share className="h-4 w-4 inline" /> Share at the bottom of Safari
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-primary">2.</span>
              <span>Scroll down and choose &quot;Add to Home Screen&quot;</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-primary">3.</span>
              <span>Tap &quot;Add&quot;</span>
            </li>
          </ol>
        </BottomSheet>
      </>
    )
  }

  return (
    <Button
      variant="outline"
      size="lg"
      className={className}
      onClick={() => {
        void promptInstall()
      }}
    >
      <Download className="mr-2 h-5 w-5" />
      Install App
    </Button>
  )
}
