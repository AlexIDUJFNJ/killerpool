import type { Metadata } from 'next'
import './globals.css'
import { GameProvider } from '@/contexts/game-context'

export const metadata: Metadata = {
  title: 'Killerpool - Modern Killer Pool Game',
  description: 'PWA приложение для управления игрой в Killer Pool (бильярд)',
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
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark">
      <body className="font-sans antialiased">
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  )
}
