import * as Sentry from '@sentry/nextjs'

/**
 * Server and edge error reporting. There is very little server code here — one
 * auth callback route and the metadata/image routes — but an error in any of
 * them is otherwise invisible too.
 */
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0,
    })
  }
}

export const onRequestError = Sentry.captureRequestError
