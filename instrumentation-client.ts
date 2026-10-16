import * as Sentry from '@sentry/nextjs'

/**
 * Client-side error reporting.
 *
 * This is where the errors are: the app is almost entirely client components,
 * so Vercel's server logs never saw a user's crash. Errors only — tracing is
 * off, because the question being answered is "what is breaking", not "what is
 * slow", and a PWA pays for every kilobyte.
 *
 * app/error.tsx and app/global-error.tsx report through this same client, so
 * the gate below covers them too: a disabled client drops captureException.
 */

// Vercel's system variable, exposed to the browser with the NEXT_PUBLIC_ prefix
// and inlined at build time: 'production' or 'preview' on a Vercel build,
// absent everywhere else.
const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Only Vercel deployments report. NODE_ENV alone was not enough: a local
  // `next build && next start` is 'production' too, and with the DSN from
  // .env.local it wrote into the project that is supposed to show real users'
  // crashes. `next dev` stays silent as before, even if `vercel env pull` has
  // put a VERCEL_ENV into .env.local.
  enabled:
    !!process.env.NEXT_PUBLIC_SENTRY_DSN &&
    process.env.NODE_ENV === 'production' &&
    (vercelEnv === 'production' || vercelEnv === 'preview'),
  // Preview events are kept apart from production ones in the same project
  environment: vercelEnv,
  tracesSampleRate: 0,
  // The offline-first flows produce a lot of expected network noise
  ignoreErrors: ['Failed to fetch', 'NetworkError', 'Load failed', 'AbortError'],
})

// Required by the SDK even with tracing off; without it every build warns
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
