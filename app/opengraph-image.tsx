import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Killerpool - Modern Killer Pool Game'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0c1015',
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.3), transparent)',
        }}
      >
        {/* Logo/Title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              fontSize: '120px',
            }}
          >
            🎱
          </div>
          <div
            style={{
              fontSize: '96px',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Killerpool
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '36px',
            color: '#e5e7eb',
            marginBottom: '48px',
            textAlign: 'center',
            maxWidth: '800px',
          }}
        >
          Modern PWA for tracking Killer Pool games
        </div>

        {/* Features */}
        <div
          style={{
            display: 'flex',
            gap: '48px',
            color: '#9ca3af',
            fontSize: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>📱</span>
            <span>Mobile-First</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>🔄</span>
            <span>Realtime</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>📴</span>
            <span>Offline</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
