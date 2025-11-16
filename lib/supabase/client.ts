import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for use in Client Components
 *
 * This client is configured for browser-side operations and includes
 * automatic session management with cookies.
 */
export function createClient() {
  // Ensure we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('createClient can only be used in browser environment')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '@supabase/ssr: Your project\'s URL and API key are required to create a Supabase client!\n\n' +
      'Check your Supabase project\'s API settings to find these values\n\n' +
      'https://supabase.com/dashboard/project/_/settings/api'
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
