import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Home, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-linear-to-br from-background via-background to-primary/5" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(16,185,129,0.1),transparent)]" />

      <div className="relative z-10 w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <div className="text-6xl font-bold bg-linear-to-r from-emerald-400 via-green-500 to-emerald-600 bg-clip-text text-transparent">
                404
              </div>
            </div>
            <CardTitle className="text-2xl">Page Not Found</CardTitle>
            <CardDescription>
              The page you are looking for doesn&apos;t exist or has been moved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Action buttons */}
            <div className="grid gap-3">
              <Link href="/" className="w-full">
                <Button size="lg" className="w-full">
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
              </Link>

              <Link href="/history" className="w-full">
                <Button variant="outline" size="lg" className="w-full">
                  <Search className="mr-2 h-4 w-4" />
                  View Game History
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
