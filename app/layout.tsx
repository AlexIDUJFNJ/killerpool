import type { Metadata } from 'next'
import './globals.css'
import { GameProvider } from '@/contexts/game-context'

export const metadata: Metadata = {
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
  themeColor: '#10b981',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Killerpool',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://killerpool.app',
    title: 'Killerpool - Modern Killer Pool Game',
    description: 'Modern PWA for tracking Killer Pool games. Play with friends, track lives, and compete with style.',
    siteName: 'Killerpool',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Killerpool - Modern Killer Pool Game',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Killerpool - Modern Killer Pool Game',
    description: 'Modern PWA for tracking Killer Pool games. Play with friends, track lives, and compete with style.',
    images: ['/og-image.png'],
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark overflow-x-hidden">
      <body className="font-sans antialiased overflow-x-hidden">
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  )
}
