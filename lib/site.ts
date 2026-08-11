/**
 * Canonical base URL for the deployment.
 *
 * Preview deployments have no NEXT_PUBLIC_APP_URL, and hard-coding the
 * production domain there makes robots.txt point at the production sitemap and
 * shared links open the production app.
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  }
  return 'https://killerpool.app'
}
