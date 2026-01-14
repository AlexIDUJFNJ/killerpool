'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { syncAllGamesToSupabase } from '@/lib/sync'
import { loadGameHistory } from '@/lib/storage'
import { ArrowLeft, CloudUpload, CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function SyncPage() {
  const [localGamesCount, setLocalGamesCount] = React.useState(0)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [result, setResult] = React.useState<{
    success: number
    failed: number
    total: number
  } | null>(null)

  React.useEffect(() => {
    const games = loadGameHistory()
    setLocalGamesCount(games.length)
  }, [])

  const handleSync = async () => {
    setIsSyncing(true)
    setResult(null)

    try {
      const syncResult = await syncAllGamesToSupabase()
      setResult(syncResult)
    } catch (error) {
      console.error('Sync failed:', error)
      setResult({ success: 0, failed: localGamesCount, total: localGamesCount })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/history">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Sync Games</h1>
        </div>

        {/* Sync Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CloudUpload className="h-5 w-5" />
              Upload to Cloud
            </CardTitle>
            <CardDescription>
              Sync your local game history to Supabase so you can share games via links
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-3xl font-bold">{localGamesCount}</div>
              <div className="text-sm text-muted-foreground">games in localStorage</div>
            </div>

            <Button
              onClick={handleSync}
              disabled={isSyncing || localGamesCount === 0}
              className="w-full"
              size="lg"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <CloudUpload className="h-4 w-4 mr-2" />
                  Sync All Games
                </>
              )}
            </Button>

            {localGamesCount === 0 && (
              <p className="text-sm text-muted-foreground text-center">
                No games found in localStorage
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle>Sync Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Synced</span>
                  </div>
                  <span className="font-bold text-green-500">{result.success}</span>
                </div>

                {result.failed > 0 && (
                  <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-500" />
                      <span>Failed</span>
                    </div>
                    <span className="font-bold text-red-500">{result.failed}</span>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span>Total</span>
                  <span className="font-bold">{result.total}</span>
                </div>

                {result.success > 0 && (
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Your games are now available via shared links!
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
