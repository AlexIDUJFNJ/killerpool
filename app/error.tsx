'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Home, RefreshCcw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-linear-to-br from-background via-background to-destructive/5" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(239,68,68,0.1),transparent)]" />

      <div className="relative z-10 w-full max-w-md">
        <Card className="border-destructive/50">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Something went wrong!</CardTitle>
            <CardDescription>
              We encountered an unexpected error. Please try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error details (only in development) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm font-mono text-muted-foreground break-all">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Error ID: {error.digest}
                  </p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="grid gap-3">
              <Button onClick={reset} size="lg" className="w-full">
                <RefreshCcw className="mr-2 h-4 w-4" />
                Try Again
              </Button>

              <Link href="/" className="w-full">
                <Button variant="outline" size="lg" className="w-full">
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
