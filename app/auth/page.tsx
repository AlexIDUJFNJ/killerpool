import type { Metadata } from 'next'
import { AuthForm } from './auth-form'
import { AUTH_ERROR_PARAM, getAuthErrorMessage } from './auth-errors'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to Killerpool to sync your games and earn achievements.',
}

/**
 * Server half of /auth: turns the ?error= code left by /auth/callback into
 * a message, so the client form needs no useSearchParams (and no Suspense
 * boundary around it).
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const code = params[AUTH_ERROR_PARAM]

  return <AuthForm initialError={getAuthErrorMessage(typeof code === 'string' ? code : null)} />
}
