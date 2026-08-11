import * as Sentry from '@sentry/nextjs'

/**
 * Client-side error reporting.
 *
 * This is where the errors are: the app is almost entirely client components,
 * so Vercel's server logs never saw a user's crash. Errors only — tracing is
 * off, because the question being answered is "what is breaking", not "what is
 * slow", and a PWA pays for every kilobyte.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Without a DSN — local development, or a preview built before the variable
  // existed — the SDK stays inert rather than warning on every page load
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  // The offline-first flows produce a lot of expected network noise
  ignoreErrors: ['Failed to fetch', 'NetworkError', 'Load failed', 'AbortError'],
})

// Required by the SDK even with tracing off; without it every build warns
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
