'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Catches errors thrown by the root layout itself, which app/error.tsx cannot
 * reach — it lives inside that layout. Without this file such an error showed
 * Next's built-in fallback and reported nowhere.
 *
 * It replaces the whole document, so it carries its own <html> and <body> and
 * cannot use anything from the app's providers or styles.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b1120',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
            The app failed to start. Reloading usually fixes it.
          </p>
          {/* A full page load on purpose: this boundary replaces the document
              because the root layout itself failed, so the client router is not
              something to rely on. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              background: '#10b981',
              color: '#0b1120',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Reload
          </a>
        </div>
      </body>
    </html>
  )
}
