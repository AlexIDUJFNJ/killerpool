import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { AUTH_ERROR_PARAM, classifyAuthError, type AuthErrorCode } from '../auth-errors'

function redirectToAuth(origin: string, code: AuthErrorCode) {
  const url = new URL('/auth', origin)
  url.searchParams.set(AUTH_ERROR_PARAM, code)
  return NextResponse.redirect(url)
}

/**
 * Where Google and the magic link land. Exchanges the one-time code for a
 * session; when that fails — the link expired, was opened in another
 * browser, the user cancelled at Google — it goes back to /auth with a
 * reason instead of dropping the user on the home screen still signed out.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // A refusal can arrive on the redirect itself, before there is any code
  const providerError = searchParams.get('error')
  if (providerError || !code) {
    return redirectToAuth(
      origin,
      classifyAuthError({ errorCode: searchParams.get('error_code'), error: providerError })
    )
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession failed:', error.code, error.message)
      return redirectToAuth(origin, classifyAuthError({ errorCode: error.code }))
    }
  } catch (error) {
    console.error('[auth/callback] exchangeCodeForSession threw:', error)
    return redirectToAuth(origin, 'callback_failed')
  }

  return NextResponse.redirect(new URL('/', origin))
}
