import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Play, Users, Trophy, QrCode, Cloud, Share2, Moon, Sun } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help & Documentation',
  description: 'Learn how to use Killerpool - game rules, features, and tips.',
}

export default function HelpPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Help & Documentation</h1>
            <p className="text-muted-foreground">Everything you need to know about Killerpool</p>
          </div>
        </div>

        {/* Game Rules */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Game Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">🎯 Objective</h3>
              <p className="text-muted-foreground">
                Be the last player standing with lives remaining. Avoid making mistakes and pocket the black ball strategically to gain extra lives.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">❤️ Starting Lives</h3>
              <p className="text-muted-foreground">
                Each player starts with <strong>3 lives</strong>. The game continues until only one player has lives remaining.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">🎱 Actions</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>MISS</strong> - You missed your shot: <span className="text-red-500 font-semibold">-1 life</span></li>
                <li><strong>POT</strong> - You potted a colored ball: <span className="text-yellow-500 font-semibold">No change</span></li>
                <li><strong>POT BLACK</strong> - You potted the black ball: <span className="text-green-500 font-semibold">+1 life</span></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">🏆 Winning</h3>
              <p className="text-muted-foreground">
                The game ends when only one player has lives remaining. That player is declared the winner!
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Features Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Quick Start</h3>
              </div>
              <p className="text-muted-foreground ml-7">
                Tap "Start New Game" on the home screen, add 2+ players with names and avatars, then tap "Start Game". Swipe cards to record actions - left for MISS, right for BLACK, up for POT.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Invite Players</h3>
              </div>
              <p className="text-muted-foreground ml-7">
                During an active game, tap the QR code icon in the header to generate an invite link or QR code. Share it with friends to let them join or spectate the game.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Cloud className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Cloud Sync</h3>
              </div>
              <p className="text-muted-foreground ml-7">
                Sign in to sync your game history across devices. Your completed games are automatically saved to the cloud and can be accessed from any device.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Share2 className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Share Results</h3>
              </div>
              <p className="text-muted-foreground ml-7">
                After a game, view game details from the History page. Export results as CSV, take a screenshot, or share directly using your device's share menu.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sun className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Theme Switcher</h3>
              </div>
              <p className="text-muted-foreground ml-7">
                The app supports light, dark, and system themes. Access theme settings from your profile page to customize the appearance.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>💡 Tips & Tricks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex gap-3">
                <span className="text-primary">•</span>
                <span>Use the undo button (↻) in the header to reverse the last action if you made a mistake</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary">•</span>
                <span>Install the app on your home screen for a native experience (iOS: Share → Add to Home Screen)</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary">•</span>
                <span>The app works offline - your games are saved locally and sync when you're back online</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary">•</span>
                <span>Use filters on the History page to find specific games by date, player name, or status</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary">•</span>
                <span>Tap the players icon (👥) during a game to view all players and their current status</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>❓ Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Can I play without an account?</h3>
              <p className="text-muted-foreground">
                Yes! You can start playing immediately without signing in. However, signing in enables cloud sync and cross-device access to your game history.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">How do I recover a lost game?</h3>
              <p className="text-muted-foreground">
                If you accidentally closed the app, tap "Resume Game" on the home screen to continue where you left off. Games are automatically saved.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Can multiple people control the same game?</h3>
              <p className="text-muted-foreground">
                Yes! If you're signed in and enable realtime sync, multiple devices can view and control the same game simultaneously.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">How do I delete a game from history?</h3>
              <p className="text-muted-foreground">
                Go to the History page, find the game you want to delete, and tap the trash icon (🗑️) in the top-right corner of the game card.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="flex justify-center">
          <Link href="/">
            <Button size="lg">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
