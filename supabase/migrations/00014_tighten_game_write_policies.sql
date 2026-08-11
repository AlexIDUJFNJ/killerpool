-- ====================================
-- Killerpool Database Schema
-- Migration: 00014_tighten_game_write_policies
-- Description: an authenticated writer owns what it writes, and a finished
--              guest game stops accepting writes once nobody has touched it
--              for an hour. Live sharing is untouched.
-- ====================================
--
-- WHAT 00009 ACTUALLY ALLOWS
--
-- Every client write is an upsert of the whole row keyed by game id, plus one
-- partial UPDATE of status/winner_id. created_by is written as `user?.id ||
-- null`, so every guest game — most of them — has created_by IS NULL; the
-- guest id from localStorage never reaches that column. Under 00009:
--
--   (1) ANY authenticated user may UPDATE ANY row with created_by IS NULL, and
--       WITH CHECK (true) lets them stamp their own id on it. From that moment
--       the real host — a guest, role anon — fails games_update_anon forever,
--       because the row is no longer unowned. One request from one signed-in
--       stranger permanently kills a shared game.
--
--   (2) WITH CHECK (true) on insert lets a signed-in user create rows owned by
--       somebody else's account, and on update lets an owner write created_by
--       = NULL back into their own row, dropping it into the anon-writable
--       pool.
--
--   (3) any anon holding the game id may rewrite any unowned row forever,
--       including games that finished months ago and still feed
--       get_leaderboard.
--
-- (1) and (2) close for free. (3) cannot be closed while the game is live.
--
-- WHY THE LIVE PHASE IS LEFT ALONE
--
-- The share link carries nothing but the game id, and the spectator holds it by
-- definition. Host and spectator are the same anon role with the same
-- knowledge, so no predicate over the row can separate them: whatever the host
-- satisfies, the spectator satisfies too. They differ only in client guards.
-- While the game is running this is survivable — the host upserts the full
-- state on every action, so a spectator's edit is overwritten by the next move.
-- Closing it properly needs a secret the host has and the spectator does not,
-- which means a new column and an RPC. Not attempted here.
--
-- What is worth closing is the phase after the game ends, when nobody is
-- overwriting the row any more.
--
-- WHY NOT A PLAIN `status <> 'completed'`
--
-- Because finishing a game is not one write but three, and they race: the
-- action that ends the game upserts a row already marked completed, the
-- completion effect upserts it again through autoSyncGame, and updateGameStatus
-- PATCHes status and winner_id. Whichever lands first flips the row; a bare
-- status check then rejects the other two. And a rejected upsert is a hard
-- error, not a skip — for INSERT ... ON CONFLICT DO UPDATE, a row failing the
-- USING expression raises rather than silently skipping the update path. The
-- client turns that into a queued retry.
--
-- It would also undo the undo: a game legally goes completed -> active ->
-- completed when the host takes back a winning shot, and the replayed result
-- would never reach the database, leaving the retracted winner on the
-- leaderboard.
--
-- A grace window has neither problem. The three completion writes are
-- milliseconds apart and an undo-and-replay is minutes, so an hour is
-- invisible to the host, while a link opened the next day is no longer a write
-- capability for a finished game.
--
-- updated_at is trustworthy here: the update_games_updated_at trigger from
-- 00001 overwrites it with NOW() on every UPDATE, so a client cannot extend its
-- own window.
--
-- THE WITH CHECK TRAP
--
-- For an upsert, the INSERT policy's WITH CHECK is applied to the proposed row
-- on both paths — not only when inserting. A status condition added to
-- games_insert_anon would therefore reject the completing upsert exactly like
-- one in games_update_anon. Both stay free of status conditions; the freeze
-- lives in the UPDATE USING clause, the only expression evaluated against the
-- old row.
--
-- WHAT THIS DELIBERATELY DOES NOT FIX
--
--  * A spectator can still rewrite a live guest game (see above).
--  * anon can still INSERT a fabricated completed game with any
--    participants[].userId, so get_leaderboard stays forgeable. Freezing old
--    rows does nothing about that; the fix belongs in get_leaderboard.
--  * Inside the grace window a vandal can flip a finished game back to active
--    and keep it writable. Closing that needs a completed_at column a write
--    cannot clear.
--  * Rows already stranded with created_by IS NULL can no longer be adopted by
--    the account that played them, because nothing in the row proves who that
--    is. They stay readable and shareable; they just stop following the
--    account, and /sync reports them as "can't upload" rather than as failures.
--
-- Reverting is re-running 00009.

-- ====================================
-- PART 1 — an authenticated writer owns what it writes
-- ====================================
-- CREATE POLICY has no IF NOT EXISTS, so DROP IF EXISTS + CREATE is the
-- idempotent form (same shape as 00009).

DROP POLICY IF EXISTS "games_insert_authenticated" ON games;
CREATE POLICY "games_insert_authenticated"
    ON games FOR INSERT
    TO authenticated
    -- was WITH CHECK (true): a signed-in user could create rows owned by
    -- another account. Also applies to the proposed row of every upsert.
    WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "games_update_authenticated" ON games;
CREATE POLICY "games_update_authenticated"
    ON games FOR UPDATE
    TO authenticated
    -- was USING (created_by = auth.uid() OR created_by IS NULL): that OR is the
    -- hostile-adoption hole. It cannot be kept in a narrowed, content-based
    -- form either, because anon may rewrite an unowned row's participants first
    -- and satisfy any such proof afterwards.
    USING (created_by = auth.uid())
    -- was WITH CHECK (true): an owner could hand the row to another account, or
    -- set created_by back to NULL and disown it.
    WITH CHECK (created_by = auth.uid());

-- ====================================
-- PART 2 — a finished guest game freezes after a grace period
-- ====================================

DROP POLICY IF EXISTS "games_update_anon" ON games;
CREATE POLICY "games_update_anon"
    ON games FOR UPDATE
    TO anon
    USING (
        created_by IS NULL
        -- Evaluated against the OLD row, which is why the three racing
        -- completion writes and an undo-and-replay all still pass: at that
        -- moment the row is either still active or was written seconds ago.
        -- An hour is slack, not a requirement. Raising it widens the
        -- defacement window; dropping below a minute risks the completion race
        -- on a slow network.
        AND (status <> 'completed' OR updated_at > now() - interval '1 hour')
    )
    -- No status condition: WITH CHECK sees the NEW row, and the completing
    -- write's new row is 'completed' by definition.
    WITH CHECK (created_by IS NULL);

-- Recreated unchanged so this migration also stands on its own against a fresh
-- database — and so the reason it must stay this permissive sits next to it.
DROP POLICY IF EXISTS "games_insert_anon" ON games;
CREATE POLICY "games_insert_anon"
    ON games FOR INSERT
    TO anon
    WITH CHECK (created_by IS NULL);

-- games_select_all (public reads, required for spectator mode) and
-- games_delete_authenticated (USING created_by = auth.uid()) are unchanged from
-- 00009 and intentionally left alone.

-- ====================================
-- COMMENTS
-- ====================================

COMMENT ON POLICY "games_insert_authenticated" ON games IS
'A signed-in user may only create games owned by their own account. Was WITH CHECK (true) in 00009, which allowed stamping another account''s id on a new row.';

COMMENT ON POLICY "games_update_authenticated" ON games IS
'A signed-in user may only update games they own, and may not change the owner. 00009 also allowed updating any row with created_by IS NULL, which let any signed-in stranger adopt a guest game and lock its real (anon) host out permanently.';

COMMENT ON POLICY "games_update_anon" ON games IS
'Guests may update unowned games. A completed game stops accepting writes an hour after its last one: the three racing completion writes and an undo-and-replay all land inside that window, while an old share link stops being a write capability. Not a boundary against a live spectator — host and spectator are the same anon role with the same knowledge, and only a host secret can separate them.';

COMMENT ON POLICY "games_insert_anon" ON games IS
'Guests may create games (created_by must be NULL). Deliberately free of status conditions: for an upsert this WITH CHECK is applied to the proposed row on both paths, so any extra condition here would also reject every host update.';
