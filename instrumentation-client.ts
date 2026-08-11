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
  // Inert without a DSN, and inert in `next dev` even with one: a developer's
  // own mistakes should not land in the project that is supposed to show real
  // users' crashes. Preview and production builds both report.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === 'production',
  tracesSampleRate: 0,
  // The offline-first flows produce a lot of expected network noise
  ignoreErrors: ['Failed to fetch', 'NetworkError', 'Load failed', 'AbortError'],
})

// Required by the SDK even with tracing off; without it every build warns
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
