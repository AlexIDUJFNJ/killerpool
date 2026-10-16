import * as Sentry from '@sentry/nextjs'

/**
 * Server and edge error reporting. There is very little server code here — one
 * auth callback route and the metadata/image routes — but an error in any of
 * them is otherwise invisible too.
 *
 * Same gate as instrumentation-client.ts, read at runtime from Vercel's
 * VERCEL_ENV: a local `next start` is NODE_ENV=production as well, and must not
 * report into the production project.
 */
export async function register() {
  const vercelEnv = process.env.VERCEL_ENV
  if (
    !process.env.NEXT_PUBLIC_SENTRY_DSN ||
    process.env.NODE_ENV !== 'production' ||
    (vercelEnv !== 'production' && vercelEnv !== 'preview')
  ) {
    return
  }

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: vercelEnv,
      tracesSampleRate: 0,
    })
  }
}

export const onRequestError = Sentry.captureRequestError
