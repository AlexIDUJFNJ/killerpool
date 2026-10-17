/**
 * The host secret: what tells the device running a guest game from everybody
 * else who knows its id (supabase/migrations/00016_host_secret.sql).
 *
 * Every game id is public — the share link is nothing but the id, and anyone
 * may read any game row — and a guest has no account. So when a game starts,
 * the host's device mints 32 random bytes and keeps them here, in
 * localStorage under `killerpool_host_secrets` as `{ [gameId]: secret }`. The
 * row in Supabase stores only hex(sha256(secret)), set by its first INSERT and
 * immutable after it; every write of the game sends the secret itself in the
 * x-host-secret header, and games_update_anon refuses an anon write whose
 * header does not hash to the row's value.
 *
 * The secret never goes into the Game object: that object is written to the
 * database, kept in history, exported, and shown to spectators.
 */

const STORAGE_KEY = 'killerpool_host_secrets'

/** The request header games_update_anon reads (PostgREST lower-cases names) */
export const HOST_SECRET_HEADER = 'x-host-secret'

/**
 * How many secrets are kept; the oldest go first. A guest game is writable for
 * 24 hours (00015), so a secret is only worth keeping that long — this is the
 * number of games one device would have to start before an older one loses its
 * secret.
 */
export const MAX_HOST_SECRETS = 50

const SECRET_RE = /^[0-9a-f]{64}$/

/** Entries in insertion order, which is the order they were minted in */
function readSecrets(): Record<string, string> {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = data ? JSON.parse(data) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && SECRET_RE.test(entry[1])
      )
    )
  } catch (error) {
    console.error('Failed to load host secrets:', error)
    return {}
  }
}

function randomSecret(): string | null {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/**
 * Mint the secret for a game this device is starting, and keep it. An
 * existing secret is returned as it is: replacing it would lock this device
 * out of its own game, because the row keeps the hash it was created with.
 *
 * null when the secret cannot be kept. Then the game goes out without a hash,
 * unprotected as before 00016 — better than a hash whose secret is gone after
 * the next reload, which would lock the host out instead.
 */
export function createHostSecret(gameId: string): string | null {
  const secrets = readSecrets()
  if (secrets[gameId]) return secrets[gameId]

  const secret = randomSecret()
  if (!secret) return null

  secrets[gameId] = secret
  // Oldest first: keep the tail
  const kept = Object.fromEntries(Object.entries(secrets).slice(-MAX_HOST_SECRETS))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept))
  } catch (error) {
    console.error('Failed to save host secret:', error)
    return null
  }
  return secret
}

/** The secret of a game this device started, or null for any other game */
export function getHostSecret(gameId: string): string | null {
  return readSecrets()[gameId] ?? null
}

/**
 * hex(sha256(secret)), as encode(sha256(convert_to(secret, 'UTF8')), 'hex')
 * computes it in the policy. null where Web Crypto's digest is unavailable —
 * crypto.subtle only exists in a secure context (https, or localhost) — and
 * the game is then written without a hash.
 */
export async function hashHostSecret(secret: string): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
