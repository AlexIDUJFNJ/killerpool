import type { Metadata, Viewport } from 'next'
import './globals.css'
import { GameProvider } from '@/contexts/game-context'
import { ThemeProvider } from '@/components/theme-provider'
import { PWAInit } from '@/components/pwa-init'
import { getBaseUrl } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: 'Killerpool - Modern Killer Pool Game',
    template: '%s | Killerpool',
  },
  description: 'Modern PWA for tracking Killer Pool games. Play with friends, track lives, and compete with style. Mobile-first design with offline support.',
  keywords: ['killer pool', 'billiards', 'pool game', 'pwa', 'game tracker', 'billiard game', 'pool tracker'],
  authors: [{ name: 'Killerpool Team' }],
  creator: 'Killerpool',
  publisher: 'Killerpool',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Killerpool',
  },
  // og:image / twitter:image come from app/opengraph-image.tsx and
  // app/twitter-image.tsx — do not list a static image here
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: getBaseUrl(),
    title: 'Killerpool - Modern Killer Pool Game',
    description: 'Modern PWA for tracking Killer Pool games. Play with friends, track lives, and compete with style.',
    siteName: 'Killerpool',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Killerpool - Modern Killer Pool Game',
    description: 'Modern PWA for tracking Killer Pool games. Play with friends, track lives, and compete with style.',
    creator: '@killerpool',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#10b981',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" suppressHydrationWarning className="overflow-x-hidden">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="font-sans antialiased overflow-x-hidden">
        <ThemeProvider defaultTheme="dark" storageKey="killerpool-theme">
          <PWAInit />
          <GameProvider>{children}</GameProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
