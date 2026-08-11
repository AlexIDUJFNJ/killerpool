const { withSentryConfig } = require('@sentry/nextjs')

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  scope: '/',
  sw: 'sw.js',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  // Offline document fallback: without this, app/offline/page.tsx is never
  // served (auto-detection only picks up app/~offline/page.*)
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 365 days
          },
        },
      },
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-api',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
          networkTimeoutSeconds: 10,
        },
      },
      {
        urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-image-assets',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\.(?:js)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-js-assets',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\.(?:css)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-css-assets',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /^https:\/\/.*\.(?:json)$/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'static-data-assets',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\/_next\/image\?url=.+$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-image',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\.(?:mp4|webm)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-video-assets',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Dev runs on Turbopack; production build MUST use webpack
  // ("next build --webpack" in package.json) — @ducanh2912/next-pwa injects
  // the service worker through the webpack hook, which Turbopack skips,
  // so a Turbopack build ships without sw.js and the PWA silently dies
  turbopack: {},
}

// Sentry wraps the outside: the PWA plugin has to see the finished webpack
// config to attach its service-worker hook.
module.exports = withSentryConfig(withPWA(nextConfig), {
  org: 'alexader',
  project: 'killerpool',
  // Source maps need SENTRY_AUTH_TOKEN at build time. Without one the build
  // must still succeed — stack traces are just minified until the token is set
  // in Vercel.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // Keeps the SDK's own debug logging out of the client bundle
  disableLogger: true,
  telemetry: false,
  silent: true,
})
