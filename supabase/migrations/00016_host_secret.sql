-- ====================================
-- Killerpool Database Schema
-- Migration: 00016_host_secret
-- Description: a guest game remembers the hash of a secret only its host's
--              device holds, and anon may update it only by presenting that
--              secret. A spectator — or anyone else holding the id — can no
--              longer rewrite a running guest game.
-- ====================================
--
-- THE HOLE
--
-- games_select_all is USING (true), so every game id is public, and the share
-- link carries nothing else. A guest host has no account, so host and
-- spectator are the same anon role with the same knowledge: whatever
-- predicate over the row the host satisfies, the spectator satisfies too.
-- 00014 and 00015 bounded the damage — a guest row is writable for 24 hours
-- from its server-side created_at, a finished one for an hour after its last
-- write — but inside that window anyone can rewrite a live game: players,
-- lives, the winner. One script that lists active games can deface every game
-- being played right now.
--
-- THE FIX
--
-- The host's device mints 32 random bytes when the game starts and keeps them
-- in localStorage (killerpool_host_secrets, never in the Game object, never in
-- the row, never in the link). The row stores
--
--     host_secret_hash = hex(sha256(secret))
--
-- written by the first INSERT, and every later anon UPDATE must carry the
-- secret itself in the x-host-secret request header. PostgREST puts the
-- request headers into the GUC request.headers as a JSON object with
-- lower-cased names; games_update_anon recomputes the hash from it and
-- compares. The hash is public like the rest of the row; the secret has 256
-- bits, so the hash gives nothing away.
--
--   * the column is immutable after INSERT (trigger games_keep_host_secret):
--     on every UPDATE it is reset to OLD. Otherwise a stranger would write
--     their own hash over the host's — or over NULL on a legacy row — and the
--     host would be the one locked out. This applies to everyone, the owner
--     and an admin included: to change a hash by hand, step around the
--     trigger (session_replication_role = replica);
--   * a missing header, an empty one and request.headers itself being unset
--     or empty all compare as NULL, i.e. fail. Not coalesce(header, ''):
--     sha256('') is a perfectly valid 64-hex value, and "no secret" should
--     never match anything;
--   * the hash is computed with the built-in sha256(bytea) (PG 11+), not
--     pgcrypto: in Supabase pgcrypto lives in schema extensions, which the
--     policy would then depend on;
--   * the header expression sits in a scalar subquery, so it is an InitPlan —
--     evaluated once per statement, not once per candidate row of a broad
--     PATCH (the same reason Supabase writes (select auth.uid()));
--   * the check lives in USING, on the OLD row, like every other anon
--     condition since 00014: an upsert failing it raises 42501, which the
--     client treats as final, and a plain PATCH from a spectator is filtered
--     to zero rows. WITH CHECK would see the same value anyway, the trigger
--     having put OLD back.
--
-- WHAT IT COSTS A CLIENT
--
-- Nothing for the bundle in production today: it never sends the column, its
-- games are inserted with host_secret_hash NULL, and a NULL hash passes —
-- such a game is exactly as protected as before 00016. games_insert_anon is
-- untouched, so a row with or without a hash inserts the same way. Rows that
-- exist today all have NULL and stay unprotected until their 24-hour window
-- from 00015 runs out; the hash cannot be set on them later (see above). That
-- is accepted: in a day there are none left.
--
-- A signed-in host is not affected at all: games_insert_authenticated and
-- games_update_authenticated are unchanged, created_by = auth.uid() already
-- tells the owner from everyone else. The new client sends the hash and the
-- header for those games too; the trigger and CHECK apply, the policy
-- ignores them. Should the account be deleted (ON DELETE SET NULL, 00015
-- section 3), the row becomes a guest row that is still protected by its
-- hash.
--
-- What changes for the next client: it may send host_secret_hash, and on every
-- write of a game it has a secret for, the x-host-secret header. A game whose
-- secret is lost (site data cleared mid-game) cannot be written by anon again;
-- the device has no way to prove it is the host any more. Before 00016 the
-- same device could still write it.
--
-- DEPLOY ORDER: THIS MIGRATION FIRST, THEN THE CLIENT
--
-- Before this migration a payload key host_secret_hash is an unknown column:
-- PostgREST rejects it with PGRST204 before Postgres sees it. The client
-- falls back to a write without the column when that happens, so the wrong
-- order loses no game — but every game it writes meanwhile is unprotected.
-- The header on its own is harmless to an old schema. The schema cache reload
-- at the bottom makes the new column visible to PostgREST at once.
--
-- POST-DEPLOY CHECK — THE ONE THING THE LOCAL HARNESS CANNOT PROVE
--
-- supabase/test/rls-policies.sql (section H) sets request.headers itself.
-- That the Supabase gateway really forwards x-host-secret to PostgREST is
-- verified only in production. CORS was checked: a preflight with
-- Access-Control-Request-Headers: ...,x-host-secret gets the header back in
-- access-control-allow-headers, so a browser does send it. If the gateway
-- then dropped it, every guest host would be locked out of their own game
-- after its first write — so check after applying this migration and before
-- the client goes live, with a throwaway row (supabase/README.md, "Применение
-- миграций к проду", has the exact curl calls):
--
--   1. INSERT a game with host_secret_hash = hex(sha256(S)), status
--      'abandoned' (it counts nowhere and freezes within the hour);
--   2. PATCH it with Prefer: return=representation and no header -> [];
--   3. the same PATCH with x-host-secret: S                      -> the row.
--
-- [] in step 3 means the header does not reach request.headers: do not ship
-- the client, revert as below.
--
-- WHAT THIS DELIBERATELY DOES NOT FIX
--
--  * Guest games inserted by the old bundle, and by a browser without
--    crypto.subtle (no secure context), have no hash and stay writable by
--    anyone for their 24 hours.
--  * Inserting is still open: anyone may INSERT a new game with any id they
--    pick, and with any participants (00015, "a GUEST identity is still
--    forgeable"). An id is generated on the host's device and is not public
--    before that device's first write, which already carries the hash.
--  * The secret is a bearer token: whoever reads the host's localStorage, or
--    a log that records request headers, can write the game until its
--    24 hours are up.
--
-- APPLYING
--
-- One transaction (the SQL Editor runs a script as one; supabase db push runs
-- each file as one). Idempotent: ADD COLUMN IF NOT EXISTS, and the
-- constraint, trigger and policy are dropped-if-exists and recreated.
--
-- Reverting: re-run PART 2 of 00015 (games_update_anon without the secret) —
-- that alone switches the protection off and is the kill switch. Then, if the
-- column itself has to go: DROP TRIGGER games_keep_host_secret ON games; DROP
-- FUNCTION games_keep_host_secret(); ALTER TABLE games DROP COLUMN
-- host_secret_hash. A client that still sends the column falls back to
-- writing without it.

-- ====================================
-- PART 1 — the column, written once
-- ====================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS host_secret_hash TEXT;

-- Lowercase hex, exactly what encode(..., 'hex') produces, so the comparison
-- in the policy is a plain text equality. A NULL passes (a CHECK passes on
-- NULL): a game without a secret. Every existing row is NULL, so ADD
-- validates without finding anything.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_host_secret_hash_format;
ALTER TABLE games ADD CONSTRAINT games_host_secret_hash_format CHECK (
    host_secret_hash ~ '^[0-9a-f]{64}$'
);

-- A trigger of its own rather than a line in games_server_timestamps: that
-- function belongs to 00015, which supabase/test re-runs, and a re-run must
-- not silently drop this rule.
CREATE OR REPLACE FUNCTION games_keep_host_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Every upsert carries host_secret_hash in its SET list; it is still the
    -- hash the row was created with — NULL included.
    NEW.host_secret_hash := OLD.host_secret_hash;
    RETURN NEW;
END;
$$;

-- Same as games_server_timestamps (00015): keep it off the callable surface
REVOKE ALL ON FUNCTION games_keep_host_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION games_keep_host_secret() FROM anon, authenticated;

DROP TRIGGER IF EXISTS games_keep_host_secret ON games;
CREATE TRIGGER games_keep_host_secret
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION games_keep_host_secret();

-- ====================================
-- PART 2 — anon updates a protected game only with its secret
-- ====================================

DROP POLICY IF EXISTS "games_update_anon" ON games;
CREATE POLICY "games_update_anon"
    ON games FOR UPDATE
    TO anon
    USING (
        created_by IS NULL
        -- 00015, unchanged: the life limit and the grace hour of a finished
        -- game. A correct secret does not extend either.
        AND created_at > now() - interval '24 hours'
        AND (status = 'active' OR updated_at > now() - interval '1 hour')
        -- 00016. NULL: a game from a client that sent no hash.
        AND (
            host_secret_hash IS NULL
            OR host_secret_hash = (
                -- request.headers is unset outside PostgREST and may read ''
                -- once a transaction-local value has been reset; ''::json
                -- raises, hence the inner NULLIF. The outer one turns an empty
                -- header into no header. NULL all the way down never matches.
                SELECT encode(sha256(convert_to(
                           NULLIF(NULLIF(current_setting('request.headers', true), '')::json
                                  ->> 'x-host-secret', ''),
                           'UTF8')), 'hex')
            )
        )
    )
    -- No status, time or secret condition: WITH CHECK sees the NEW row (00014),
    -- and its hash is OLD's again by now (games_keep_host_secret).
    WITH CHECK (created_by IS NULL);

-- games_insert_anon, games_insert_authenticated, games_update_authenticated,
-- games_select_all and games_delete_authenticated are unchanged from 00014.

-- PostgREST caches the schema; without a reload the new column is unknown to
-- it (PGRST204) until the next automatic one
NOTIFY pgrst, 'reload schema';

-- ====================================
-- COMMENTS
-- ====================================

COMMENT ON COLUMN games.host_secret_hash IS
'hex(sha256(secret)) of the secret the host''s device minted when the game started (00016). Set by the first INSERT, immutable afterwards (games_keep_host_secret). anon may update the row only with the secret in the x-host-secret header. NULL: a game from a client that sent none — unprotected, as before 00016.';

COMMENT ON CONSTRAINT games_host_secret_hash_format ON games IS
'host_secret_hash is NULL or 64 lowercase hex characters: a SHA-256 in the form encode(..., ''hex'') produces.';

COMMENT ON FUNCTION games_keep_host_secret() IS
'BEFORE UPDATE on games: host_secret_hash := OLD.host_secret_hash. Otherwise anyone allowed to update a row could replace the host''s hash — or set one on a legacy row — and lock the host out.';

COMMENT ON POLICY "games_update_anon" ON games IS
'Guests may update unowned games for 24 hours from the server-side created_at, and a finished (completed or abandoned) game only within an hour of its last write. A game with a host_secret_hash only with the matching secret in the x-host-secret header (00016) — that is what tells the host from a spectator. A game without one (old clients) is writable by anyone holding its id, as before.';
