import type { Metadata, Viewport } from 'next'
import './globals.css'
import { GameProvider } from '@/contexts/game-context'
import { PWAInit } from '@/components/pwa-init'
import { MotionProvider } from '@/components/motion-provider'
import { getBaseUrl } from '@/lib/site'
import { THEME_SCRIPT } from '@/components/theme'

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
    // 'black': an opaque bar with light text. It suits the dark default theme,
    // stays legible over the light one, and keeps the page below the bar —
    // 'black-translucent' would draw the header under the clock, and
    // 'default' put a white bar above a dark app.
    statusBarStyle: 'black',
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

// No maximumScale: capping zoom at 1 locks out anyone who needs to enlarge the
// text (WCAG 1.4.4). Inputs use a 16px font, so iOS does not zoom on focus.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#10b981',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="overflow-x-hidden">
      <head>
        {/* Applies the stored theme before the first paint; a React provider
            would run after hydration and flash the wrong theme. The content
            is a constant from components/theme.ts — nothing user-supplied. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* metadata.appleWebApp emits mobile-web-app-capable and the status
            bar style; older iOS still needs the apple- prefixed capable tag */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="font-sans antialiased overflow-x-hidden">
        <PWAInit />
        <MotionProvider>
          <GameProvider>{children}</GameProvider>
        </MotionProvider>
      </body>
    </html>
  )
}
