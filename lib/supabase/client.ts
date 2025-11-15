import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for use in Client Components
 *
 * This client is configured for browser-side operations and includes
 * automatic session management with cookies.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
