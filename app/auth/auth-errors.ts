/**
 * Why a sign-in did not complete, as passed from /auth/callback to /auth.
 *
 * Only these codes travel in the URL, never the provider's own message: a
 * free-text ?error= would let any link put arbitrary words on the sign-in
 * page, and the raw messages are written for developers anyway.
 */
export type AuthErrorCode = 'cancelled' | 'link_expired' | 'other_browser' | 'callback_failed'

export const AUTH_ERROR_PARAM = 'error'

const MESSAGES: Record<AuthErrorCode, string> = {
  cancelled: 'Sign-in was cancelled. You can try again whenever you like.',
  link_expired: 'That sign-in link has expired or was already used. Request a new one below.',
  other_browser:
    'Open the sign-in link in the same browser you requested it from, or request a new link here.',
  callback_failed: 'We could not sign you in. Please try again.',
}

export function getAuthErrorMessage(code: string | null | undefined): string | null {
  // hasOwn, not `in`: "toString" and friends are on every object's prototype
  return code && Object.hasOwn(MESSAGES, code) ? MESSAGES[code as AuthErrorCode] : null
}

/**
 * Maps what Supabase or the OAuth provider reported to one of our codes.
 * `errorCode` is Supabase's machine-readable code (error_code on the
 * redirect, or AuthError.code from the exchange); `error` is the OAuth
 * error parameter.
 */
export function classifyAuthError({
  errorCode,
  error,
}: {
  errorCode?: string | null
  error?: string | null
}): AuthErrorCode {
  switch (errorCode) {
    case 'otp_expired':
    case 'flow_state_expired':
      return 'link_expired'
    // The PKCE verifier lives in the browser that asked for the link
    case 'flow_state_not_found':
    case 'bad_code_verifier':
      return 'other_browser'
  }
  // Supabase sends expired email links back as access_denied too, which is
  // why error_code is checked first
  if (error === 'access_denied') return 'cancelled'
  return 'callback_failed'
}
