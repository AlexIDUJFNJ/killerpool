-- ====================================
-- Killerpool Database Schema
-- Migration: 00015_game_integrity_and_spam_limits
-- Description: the server owns a game's dates, a guest game has a finite
--              writable life, a game row has a size and its winner is one of
--              its players, the profile / ruleset / perfect_game loose ends
--              are closed, and a signed-in user's identity counts only in
--              games their own account wrote.
-- ====================================
--
-- Eight holes left after 00014. Each section names the hole, the fix, and what
-- it costs a client. Unless a section says otherwise, the cost is nothing — for
-- the client running in production today and for the next one alike: every
-- write is still the full-row upsert of lib/game-mapper.ts, and nothing here
-- adds a column or renames anything a client reads.
--
-- 1. THE CLIENT OWNS THE DATES
--
-- The upsert's SET list is built from the payload's keys, so created_at is
-- rewritten on every write. update_games_updated_at (00001) is BEFORE UPDATE
-- only, so on INSERT updated_at is whatever the client sent. Consequences:
--
--   * a game dated 2999 is "the most recent game" forever. get_leaderboard
--     takes a player's fallback display name from their newest game
--     (00013:149-150) — so it hijacks the name — and check_achievements counts
--     the win streak from the newest game down (00011:154), so one planted loss
--     ends a streak permanently;
--   * a row INSERTed with updated_at = 2999 never leaves the one-hour grace of
--     games_update_anon (00014): one request bypasses the freeze.
--
-- Fix: trigger games_server_timestamps, BEFORE INSERT OR UPDATE.
--   INSERT  created_at := LEAST(COALESCE(created_at, now()), now())
--           updated_at := now()
--   UPDATE  created_at := OLD.created_at
--           updated_at := now()
-- A past created_at is kept on purpose: a game played offline is inserted when
-- the device comes back, possibly days later, and it must still sort by when
-- it was played. Only the future is refused. It replaces
-- update_games_updated_at; update_updated_at_column itself stays (player_profiles
-- uses it) and gets the search_path it never had. Rows already dated in the
-- future are pulled back to the present (PART 1).
--
-- 2. A GUEST GAME IS WRITABLE FOREVER
--
-- games_update_anon (00014) freezes only status = 'completed', and only an hour
-- after its last write. But:
--
--   * inside that hour completed -> active is a legal write (the host's undo),
--     and an active row never freezes — so a vandal reopens a finished game
--     once and owns it for good;
--   * active and abandoned rows never freeze at all;
--   * games_select_all hands every id to anyone who asks, so "knowing the id" is
--     no barrier: one script can rewrite every guest game ever played.
--
-- Fix: anon may update a row only while it is younger than 24 hours by its
-- server-side created_at, and a finished row — completed OR abandoned — only
-- within an hour of its last write. Both conditions sit in USING, evaluated on
-- the OLD row, for the reason 00014 gives (an INSERT policy's WITH CHECK also
-- gates the DO UPDATE of an upsert, so nothing time- or status-based may live
-- there).
--
-- Why 24 hours. A game of killer pool takes minutes to a couple of hours. A
-- day covers a game that runs past midnight or is picked up the next morning,
-- plus a device clock that is hours behind — a manually-set clock in the wrong
-- time zone is the usual case, up to ~14 h. A clock that is AHEAD costs
-- nothing, the INSERT clamp pulls it to now(). Every hour beyond that is an
-- hour in which anyone can deface any guest game; every hour below it starts
-- cutting off paused games and skewed clocks.
--
-- What still passes (supabase/test/rls-policies.sql, sections A, R, T):
--   * the three racing completion writes and undo-and-replay — at that point
--     the old row is minutes old, even for a game started 23 hours earlier;
--   * an offline game first uploaded days after it was played — that is an
--     INSERT, and neither limit applies to INSERT.
--
-- What it costs: created_at is the client's date of the game, so for anon the
-- clock starts when the game was STARTED, not when the server first saw it.
-- Newly refused, from the second write on: a game resumed more than a day
-- after it was started, and every game from a device whose clock is more than
-- a day behind. The first write always lands, because it is an INSERT; what is
-- refused are the edits after it. (Re-sending an offline game uploaded days
-- late — test E2 — was refused by 00014 already: its hour counted from the
-- client's own updated_at, i.e. from when the game ended.) A signed-in host is
-- not affected by any of this.
--
-- 3. DELETING AN ACCOUNT HANDS ITS GAMES TO ANON
--
-- games.created_by REFERENCES auth.users ON DELETE SET NULL (00001:72): the
-- deleted account's games become guest games, i.e. anon-writable. Worse, the
-- SET NULL is an UPDATE, and the 00001 trigger stamped updated_at = now() on
-- each of those rows — reopening every finished game of the account for an
-- hour and its unfinished ones forever.
--
-- Section 2 freezes everything older than 24 hours. For the rest, the trigger
-- recognises the one write that turns an owned row into an unowned one: no
-- client can make it (games_update_authenticated requires created_by =
-- auth.uid() on the new row; anon cannot touch an owned row), so it is the FK
-- action — or an admin by hand. It is not a game write: the timestamps are
-- kept, and an unfinished game is retired to 'abandoned', so the row freezes an
-- hour after its owner's last real write. Residual: a game the owner wrote to
-- in the hour before the deletion stays writable until that hour is up.
--
-- 4. NO SIZE LIMIT
--
-- Every get_leaderboard call unrolls participants and history of every
-- completed game, and anon INSERT takes any jsonb up to the request limit.
-- Limits, all as CHECK constraints (they apply to authenticated writes too):
--
--   games_participants_max   at most 32 participants. The client has no cap
--                            (app/game/new/page.tsx only demands two, and
--                            addPlayer in game-context adds mid-game without
--                            one). Everyone shoots once per round, so a game
--                            of 32 is already an evening; it is twice the size
--                            of the biggest pub game anyone plays.
--   games_history_max        at most 1000 history entries. Ending a game burns
--                            ~3 lives per losing player; at a 50% pot rate a
--                            16-player game takes ~100 shots, 32 players ~200,
--                            even sharp shooters (80%) under 500.
--   games_payload_size       participants + history at most 512 KiB of JSON
--                            text. A real entry is ~230 bytes, so 1000 of them
--                            fit with room to spare; the cap stops a handful of
--                            entries carrying megabyte-long names.
--
-- Measured with octet_length(x::text), not pg_column_size: the latter returns
-- the compressed size for a column an UPDATE did not touch and the raw size
-- for one it did, so the same row could pass or fail depending on the write.
--
-- 5. winner_id NEED NOT BE A PLAYER
--
-- winner_id is a bare uuid (00001:69). games_winner_is_participant requires it
-- to be NULL or the id of one of the participants. The comparison lower-cases
-- the JSON: a uuid column always renders lowercase, a client may not — the
-- reason get_leaderboard lower()s both sides since 00012.
--
-- NOT VALID, THEN VALIDATE IN A SUB-TRANSACTION
--
-- The four constraints are added NOT VALID, which enforces them on every new
-- INSERT and UPDATE at once without looking at existing rows. Then each one is
-- validated inside its own BEGIN ... EXCEPTION block: where old rows comply it
-- becomes a normal validated constraint; where they do not, the validation is
-- rolled back alone, a NOTICE gives the constraint and the number of offending
-- rows, and the constraint stays NOT VALID — still enforced for writes. A
-- plain VALIDATE would abort the whole migration on the first offending
-- legacy row; skipping VALIDATE would leave clean databases with constraints
-- that claim less than they guarantee. Nothing is deleted or rewritten to
-- make old rows comply. A NOT VALID row is still checked when it is updated,
-- so such a row can no longer be re-synced unchanged — it is frozen for anon
-- anyway, and for its owner /sync reports it as refused.
--
-- 6. SPAM
--
--   * "Users can insert their own profile" (00001:100-102) has no TO clause and
--     ends in OR user_id IS NULL: anon may insert any number of profiles, and
--     UNIQUE (user_id) admits any number of NULLs. Now authenticated only, and
--     only user_id = auth.uid(). The client writes profiles in two places,
--     ensurePlayerProfile (lib/sync.ts) and app/profile/page.tsx, both
--     upserting {user_id: user.id} for a signed-in user — exactly that shape.
--   * "Authenticated users can create rulesets" is WITH CHECK (true). The
--     client never writes rulesets — it plays DEFAULT_RULESET from lib/types.ts
--     and the only reference to the table is the generated database.types.ts —
--     so the policy is dropped, and with no INSERT policy left nobody inserts.
--   * idx_rulesets_is_default is not unique, so nothing kept a second default
--     out: through the policy above any signed-in user could insert one, and
--     the 00001 seed is no guard either — its ON CONFLICT DO NOTHING has
--     nothing to conflict on. Extra defaults are demoted (not deleted),
--     keeping 'Classic Killer Pool' — the oldest one if there are several —
--     and the index becomes unique, which also gives the seed's ON CONFLICT
--     something to mean.
--
-- 7. perfect_game FOR NOT PLAYING
--
-- check_achievements v2 grants perfect_game when the winner's history entries
-- lost no lives and none were malformed (00011:181) — both trivially true of
-- an empty set, so a win without a single shot was a perfect game. v3 also
-- requires at least one entry. Apart from that and the created_by rule of
-- section 8, v3 is v2 verbatim, including
-- SECURITY DEFINER, the search_path, the p_user_id = auth.uid() guard and the
-- grants (re-issued below; CREATE OR REPLACE would keep them anyway).
--
-- 8. ANYONE CAN PLAY AS A SIGNED-IN USER
--
-- get_leaderboard groups a participant by participants[].userId, and
-- check_achievements counts every completed game whose participants carry the
-- user's userId — while anon may INSERT any completed game. One request adds a
-- win or a loss to any registered player's row, ends their win streak, or
-- renames them (the forged game becomes their newest, and the fallback name
-- comes from it).
--
-- An account's identity is now believed only where the row vouches for it.
-- That costs honest data nothing, because in the client
--   * a game created under an account is written only by that account
--     (rowOwner in lib/sync.ts; otherwise it stays queued), so created_by is
--     that account's uid;
--   * only the host carries a userId (createGame marks one player; addPlayer
--     passes null).
-- So:
--   * get_leaderboard v6 (PART 6): a userId that is an ACCOUNT's uid groups
--     the player only when it equals the row's created_by; otherwise the
--     participant is grouped by participants[].id. A userId that is no
--     account — the device guest id — still groups the player, as since
--     00005, so a guest host's games add up across games, including those
--     from before the device roster, when every game minted fresh
--     participant ids. "An account" = a uid in player_profiles.user_id or
--     games.created_by (PART 6 says why not auth.users).
--   * A participant grouped by its id where that id IS an account's uid is
--     dropped. Otherwise the forger just moves the victim's uid from userId
--     to id, and the row merges with the victim's and takes their profile
--     name.
--   * check_achievements v3 (PART 5) counts only games with created_by =
--     p_user_id: the game it is called for, total wins, the streak and the
--     social count.
--
-- What moves for existing rows:
--   * nothing for guests. A guest game adopted on its first INSERT after
--     signing in (created_by = uid, host userId = the device's guest id) keeps
--     counting with that device's other guest games, under the guest id; it
--     does not join the account, and grants it no achievements;
--   * a game created under an account but written anonymously or under another
--     account (possible before rowOwner) no longer counts for that account;
--   * a deleted account's uid is in neither table any more (profile cascaded,
--     created_by set NULL), so its old games group under it like a guest id —
--     what 00013 did.
--
-- What remains: an account that has written nothing yet (no profile, no game)
-- is indistinguishable from a guest id, so a game forged in its name groups
-- under its uid until its first write.
--
-- WHAT THIS DELIBERATELY DOES NOT FIX
--
--  * A spectator can still rewrite a LIVE guest game whose id they know.
--    Host and spectator are the same anon role with the same knowledge; only
--    a secret the host holds can separate them (new column + RPC + client).
--  * A GUEST identity is still forgeable: a participant id and a guest id are
--    printed in every public game row, so anon can insert games under them and
--    move that guest's leaderboard row. Accounts are covered by section 8
--    (except one that has written nothing yet); a signed-in user can of
--    course still write anything into their own games.
--  * The number of anon INSERTs is not bounded — Postgres has no rate limit;
--    the size limits bound each row, not the table.
--  * Profiles already created with user_id NULL, and rulesets created through
--    the dropped policy, are left in place (a NOTICE counts the profiles). They
--    are inert: nothing joins on a NULL user_id, and no client reads rulesets.
--
-- APPLYING
--
-- One transaction (the SQL Editor runs a script as one; supabase db push runs
-- each file as one). Idempotent: every object is dropped-if-exists and
-- recreated, the data fixes touch only rows that still need them.
--
-- Reverting: recreate update_games_updated_at from 00001 and drop
-- games_server_timestamps; re-run 00014 (policies); drop the four games_*
-- constraints and idx_rulesets_one_default (then recreate the plain index from
-- 00001); re-run section 4 of 00011 (check_achievements v2) and 00013
-- (get_leaderboard v5).

-- ====================================
-- PART 1 — the server owns created_at and updated_at
-- ====================================

-- No SECURITY DEFINER here, so a hostile search_path cannot escalate anything;
-- pinned anyway, as everything else in this schema is (and Supabase's linter
-- flags a mutable one).
ALTER FUNCTION update_updated_at_column() SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION games_server_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- A past date is the client's to give (an offline game is uploaded
        -- after the fact); a future one is not.
        NEW.created_at := LEAST(COALESCE(NEW.created_at, now()), now());
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    -- Every upsert carries created_at in its SET list; it is still the date the
    -- row was created.
    NEW.created_at := OLD.created_at;

    IF OLD.created_by IS NOT NULL AND NEW.created_by IS NULL THEN
        -- No client can write this (see header, section 3): it is ON DELETE SET
        -- NULL from auth.users, or an admin. Not a game write — keep the time of
        -- the owner's last real write, so the one-hour freeze counts from it,
        -- and retire a game nobody will finish.
        NEW.updated_at := OLD.updated_at;
        IF NEW.status = 'active' THEN
            NEW.status := 'abandoned';
        END IF;
        RETURN NEW;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- A trigger fires regardless of EXECUTE; revoking keeps the function off the
-- callable surface. Supabase's default privileges grant EXECUTE on new public
-- functions to anon and authenticated by name, hence the second line.
REVOKE ALL ON FUNCTION games_server_timestamps() FROM PUBLIC;
REVOKE ALL ON FUNCTION games_server_timestamps() FROM anon, authenticated;

-- The data fix runs between the DROP and the CREATE, with no trigger on games:
-- the old trigger would re-stamp updated_at = now() on every row it fixes and
-- so reopen finished guest games for an hour, the new one would keep the very
-- created_at being fixed. Same transaction, so no client write slips through
-- the gap: DROP TRIGGER locks games against writes until COMMIT.
DROP TRIGGER IF EXISTS games_server_timestamps ON games;
DROP TRIGGER IF EXISTS update_games_updated_at ON games;

-- Future dates come from a clock running ahead or from a forger; either way
-- the latest moment the row can really be from is its last write, or now.
-- updated_at only moves if it is itself in the future, so a frozen game stays
-- frozen.
UPDATE games
   SET created_at = LEAST(created_at, updated_at, now()),
       updated_at = LEAST(updated_at, now())
 WHERE created_at > now()
    OR updated_at > now();

CREATE TRIGGER games_server_timestamps
    BEFORE INSERT OR UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION games_server_timestamps();

-- ====================================
-- PART 2 — a guest game has a finite writable life
-- ====================================

DROP POLICY IF EXISTS "games_update_anon" ON games;
CREATE POLICY "games_update_anon"
    ON games FOR UPDATE
    TO anon
    USING (
        created_by IS NULL
        -- Life limit. created_at is server-clamped (PART 1) and immutable, so
        -- no write can extend it; reopening a finished game buys at most what
        -- is left of the day.
        AND created_at > now() - interval '24 hours'
        -- A finished game — completed or abandoned — keeps the 00014 grace
        -- hour for the racing completion writes and undo-and-replay.
        -- updated_at is server time on INSERT too now, so it cannot be
        -- planted in the future.
        AND (status = 'active' OR updated_at > now() - interval '1 hour')
    )
    -- No status or time condition: WITH CHECK sees the NEW row (00014).
    WITH CHECK (created_by IS NULL);

-- games_insert_anon, games_insert_authenticated, games_update_authenticated,
-- games_select_all and games_delete_authenticated are unchanged from 00014.

-- ====================================
-- PART 3 — a game row has a size, and its winner is one of its players
-- ====================================
-- ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS: DROP IF EXISTS + ADD.

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_participants_max;
ALTER TABLE games ADD CONSTRAINT games_participants_max CHECK (
    -- a non-array already fails valid_participants (00001); guarded so this
    -- one never raises instead of returning false
    CASE WHEN jsonb_typeof(participants) = 'array'
         THEN jsonb_array_length(participants) <= 32
         ELSE false
    END
) NOT VALID;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_history_max;
ALTER TABLE games ADD CONSTRAINT games_history_max CHECK (
    -- NULL or a non-array is valid_history's business, not this one's
    CASE WHEN jsonb_typeof(history) = 'array'
         THEN jsonb_array_length(history) <= 1000
         ELSE true
    END
) NOT VALID;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_payload_size;
ALTER TABLE games ADD CONSTRAINT games_payload_size CHECK (
    octet_length(participants::text)
      + octet_length(COALESCE(history, '[]'::jsonb)::text) <= 524288
) NOT VALID;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_winner_is_participant;
ALTER TABLE games ADD CONSTRAINT games_winner_is_participant CHECK (
    winner_id IS NULL
    -- lower() of jsonb text output is still valid JSON: keys and literals are
    -- already lowercase and escapes stay escapes (É -> É)
    OR lower(participants::text)::jsonb
       @> ('[{"id": "' || winner_id::text || '"}]')::jsonb
) NOT VALID;

DO $$
DECLARE
    v_name TEXT;
    v_expr TEXT;
    v_bad  BIGINT;
BEGIN
    FOREACH v_name IN ARRAY ARRAY[
        'games_participants_max',
        'games_history_max',
        'games_payload_size',
        'games_winner_is_participant'
    ] LOOP
        BEGIN
            EXECUTE format('ALTER TABLE games VALIDATE CONSTRAINT %I', v_name);
        EXCEPTION WHEN check_violation THEN
            SELECT pg_get_expr(conbin, conrelid) INTO v_expr
              FROM pg_constraint
             WHERE conrelid = 'games'::regclass AND conname = v_name;
            -- NOT (expr) skips NULL exactly as CHECK does
            EXECUTE format('SELECT count(*) FROM games WHERE NOT (%s)', v_expr)
               INTO v_bad;
            RAISE NOTICE '% stays NOT VALID: % existing row(s) violate it. New writes are checked. List them with: SELECT id FROM games WHERE NOT (%);',
                v_name, v_bad, v_expr;
        END;
    END LOOP;
END $$;

-- ====================================
-- PART 4 — profiles and rulesets stop accepting spam
-- ====================================

DROP POLICY IF EXISTS "Users can insert their own profile" ON player_profiles;
CREATE POLICY "Users can insert their own profile"
    ON player_profiles FOR INSERT
    TO authenticated
    -- was: no TO clause, WITH CHECK (auth.uid() = user_id OR user_id IS NULL)
    WITH CHECK (user_id = auth.uid());

DO $$
DECLARE
    v_orphans BIGINT;
BEGIN
    SELECT count(*) INTO v_orphans FROM player_profiles WHERE user_id IS NULL;
    IF v_orphans > 0 THEN
        RAISE NOTICE 'player_profiles: % row(s) with user_id NULL left in place (inert: nothing joins on NULL). Remove with: DELETE FROM player_profiles WHERE user_id IS NULL;',
            v_orphans;
    END IF;
END $$;

-- The client never inserts rulesets; no INSERT policy means no inserts.
DROP POLICY IF EXISTS "Authenticated users can create rulesets" ON rulesets;

-- One default ruleset. Demote all but one first, or the unique index fails.
UPDATE rulesets
   SET is_default = false
 WHERE is_default
   AND id <> (
       SELECT id FROM rulesets
        WHERE is_default
        ORDER BY (name = 'Classic Killer Pool') DESC, created_at, id
        LIMIT 1
   );

DROP INDEX IF EXISTS idx_rulesets_is_default;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rulesets_one_default
    ON rulesets (is_default)
    WHERE is_default;

-- ====================================
-- PART 5 — check_achievements v3: no perfect game without a shot, and only
--          the user's own games count
-- ====================================
-- Same signature, so CREATE OR REPLACE replaces v2 in place.

CREATE OR REPLACE FUNCTION check_achievements(p_user_id UUID, p_game_id UUID)
RETURNS TABLE(achievement_type TEXT, is_new BOOLEAN) AS $$
#variable_conflict use_variable
DECLARE
  v_game games%ROWTYPE;
  v_user_elem JSONB;
  v_winner_id TEXT;
  v_winner_lives INTEGER;
  v_winner_actions INTEGER;
  v_lost_lives INTEGER;
  v_malformed INTEGER;
  v_pot_blacks INTEGER;
  v_total_wins INTEGER;
  v_streak INTEGER;
  v_social_games INTEGER;
  v_earned TEXT[] := '{}';
  v_type TEXT;
BEGIN
  -- SECURITY DEFINER bypasses RLS: never trust the caller-supplied user id
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  -- Only a game the user's own account wrote counts (header, section 8): an
  -- honest game of a signed-in user always carries created_by = their uid,
  -- while anyone can INSERT a game naming them in participants[].userId.
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id AND status = 'completed' AND created_by = p_user_id;

  IF NOT FOUND OR v_game.winner_id IS NULL THEN
    RETURN;
  END IF;

  v_winner_id := v_game.winner_id::TEXT;
  -- Containment probe reused by the aggregate queries below (GIN-indexable)
  v_user_elem := jsonb_build_array(jsonb_build_object('userId', p_user_id::TEXT));

  -- Only the winner earns achievements, and only when the winning participant
  -- belongs to the calling user. participants[].userId is set for the player
  -- marked as the creator only (see createGame in lib/game-logic.ts).
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_game.participants) p
    WHERE p->>'id' = v_winner_id
      AND p->>'userId' = p_user_id::TEXT
  ) THEN
    RETURN;
  END IF;

  -- Winner's stats in this game. All id comparisons are text = text and all
  -- numeric casts are guarded: participants/history come from clients (games
  -- are anon-writable), so malformed values must not abort the call.
  SELECT CASE WHEN (p->>'lives') ~ '^-?[0-9]+$' THEN (p->>'lives')::INTEGER END
  INTO v_winner_lives
  FROM jsonb_array_elements(v_game.participants) p
  WHERE p->>'id' = v_winner_id
  LIMIT 1;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE h->>'action' = 'pot_black'),
    COUNT(*) FILTER (WHERE CASE
      WHEN (h->>'livesAfter') ~ '^-?[0-9]+$' AND (h->>'livesBefore') ~ '^-?[0-9]+$'
      THEN (h->>'livesAfter')::INTEGER < (h->>'livesBefore')::INTEGER
      ELSE FALSE END),
    COUNT(*) FILTER (WHERE NOT (
      (h->>'livesAfter') ~ '^-?[0-9]+$' AND (h->>'livesBefore') ~ '^-?[0-9]+$'))
  INTO v_winner_actions, v_pot_blacks, v_lost_lives, v_malformed
  FROM jsonb_array_elements(COALESCE(v_game.history, '[]'::jsonb)) h
  WHERE h->>'playerId' = v_winner_id;

  -- Total wins across the user's own completed games (created_by, as above)
  -- where their participant won. The @> prefilter narrows via the GIN index.
  SELECT COUNT(*) INTO v_total_wins
  FROM games g
  WHERE g.status = 'completed'
    AND g.winner_id IS NOT NULL
    AND g.created_by = p_user_id
    AND g.participants @> v_user_elem
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(g.participants) p
      WHERE p->>'id' = g.winner_id::TEXT
        AND p->>'userId' = p_user_id::TEXT
    );

  -- Current win streak: leading wins in the user's own completed games, newest
  -- first. A planted loss is not one of them, so it cannot end the streak.
  SELECT COUNT(*) INTO v_streak
  FROM (
    SELECT
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(g.participants) p
        WHERE p->>'id' = g.winner_id::TEXT
          AND p->>'userId' = p_user_id::TEXT
      ) AS won,
      SUM(
        CASE WHEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(g.participants) p
          WHERE p->>'id' = g.winner_id::TEXT
            AND p->>'userId' = p_user_id::TEXT
        ) THEN 0 ELSE 1 END
      ) OVER (ORDER BY g.created_at DESC, g.id DESC) AS losses_so_far
    FROM games g
    WHERE g.status = 'completed'
      AND g.winner_id IS NOT NULL
      AND g.created_by = p_user_id
      AND g.participants @> v_user_elem
  ) t
  WHERE t.won AND t.losses_so_far = 0;

  -- The user's own completed games with 4+ players.
  SELECT COUNT(*) INTO v_social_games
  FROM games g
  WHERE g.status = 'completed'
    AND g.created_by = p_user_id
    AND jsonb_array_length(g.participants) >= 4
    AND g.participants @> v_user_elem;

  -- Collect earned achievement types. Thresholds use >= so long-time players
  -- receive milestones retroactively on their next win.
  -- (::TEXT keeps || as array-append; a bare literal is parsed as an array)
  IF v_total_wins >= 1 THEN v_earned := v_earned || 'first_win'::TEXT; END IF;
  IF v_total_wins >= 10 THEN v_earned := v_earned || 'wins_10'::TEXT; END IF;
  IF v_total_wins >= 25 THEN v_earned := v_earned || 'wins_25'::TEXT; END IF;
  IF v_total_wins >= 50 THEN v_earned := v_earned || 'wins_50'::TEXT; END IF;
  IF v_streak >= 3 THEN v_earned := v_earned || 'win_streak_3'::TEXT; END IF;
  IF v_streak >= 5 THEN v_earned := v_earned || 'win_streak_5'::TEXT; END IF;
  IF v_winner_lives = 1 THEN v_earned := v_earned || 'survivor'::TEXT; END IF;
  -- perfect_game requires the winner to have played (v2 granted it for an
  -- empty history: "no lives lost" is true of nothing) and a fully well-formed
  -- history: entries missing numeric livesBefore/livesAfter must not count as
  -- "no lives lost"
  IF v_winner_actions > 0 AND v_lost_lives = 0 AND v_malformed = 0 THEN
    v_earned := v_earned || 'perfect_game'::TEXT;
  END IF;
  IF v_pot_blacks >= 5 THEN v_earned := v_earned || 'pot_black_master'::TEXT; END IF;
  IF v_social_games >= 10 THEN v_earned := v_earned || 'social_player'::TEXT; END IF;

  -- Anti-join instead of ON CONFLICT: a conflict column list would collide with
  -- the achievement_type OUT parameter, and a constraint name would tie the
  -- function to an autogenerated identifier. The UNIQUE constraint still
  -- backstops the rare concurrent-call race.
  FOREACH v_type IN ARRAY v_earned LOOP
    BEGIN
      INSERT INTO user_achievements (user_id, achievement_type, game_id)
      SELECT p_user_id, v_type, p_game_id
      WHERE NOT EXISTS (
        SELECT 1 FROM user_achievements ua
        WHERE ua.user_id = p_user_id AND ua.achievement_type = v_type
      );
      IF FOUND THEN
        achievement_type := v_type;
        is_new := TRUE;
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- concurrent call granted it first
    END;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION check_achievements(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_achievements(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION check_achievements(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_achievements(UUID, UUID) TO service_role;

-- ====================================
-- PART 6 — get_leaderboard v6: an account's identity needs the row's word
-- ====================================
-- Same signature as v5 (00013), so CREATE OR REPLACE swaps the body and keeps
-- the grants. Everything but the accounts / keyed_rows CTEs and the filter in
-- stable_rows is v5 verbatim: no casts of client JSON, the single ::uuid
-- regex-guarded, wins per distinct game, both clamps, min_games.
--
-- A participant's grouping key:
--   userId empty / not a uuid               -> participants[].id
--   userId is not an account (a guest id)   -> userId, as in 00012/00013, so a
--                                              guest host's games from before
--                                              the device roster add up
--   userId is an account, created_by = it   -> userId: the account's own game
--   userId is an account, created_by is not -> participants[].id: a forgery,
--                                              or a write by someone else
-- and a participant keyed by participants[].id that IS an account's id drops
-- out (otherwise the forger moves the victim's uid from userId to id).
--
-- "An account" is a uid in player_profiles.user_id or games.created_by — both
-- foreign keys to auth.users, so each value proves an account, and both are
-- in public: the function needs no access to the auth schema, which would take
-- the whole leaderboard down if the owner ever lost SELECT on auth.users. Every
-- account that has written a game or a profile is in it (ensurePlayerProfile
-- runs before every signed-in write). An account that has written nothing yet
-- is not: a game forged in its name groups under its uid like a guest id until
-- its first write, then falls back to participants[].id.

CREATE OR REPLACE FUNCTION get_leaderboard(
    limit_count INTEGER DEFAULT 15,
    min_games   INTEGER DEFAULT 3
)
RETURNS TABLE (
    player_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    total_games BIGINT,
    games_won BIGINT,
    games_lost BIGINT,
    win_rate NUMERIC,
    total_actions BIGINT,
    total_black_pots BIGINT,
    rank INTEGER
)
SECURITY DEFINER              -- global leaderboard, reads past RLS
SET search_path = public, pg_temp   -- pg_temp last and explicit: otherwise
                                    -- Postgres searches temp objects first,
                                    -- which is a SECURITY DEFINER hazard
AS $$
#variable_conflict use_column       -- OUT parameter names collide with column
                                    -- names; always prefer the column
BEGIN
    RETURN QUERY
    WITH accounts AS (
        -- Every uid known to be an account (see above). Text, so the joins
        -- below compare text with text and nothing from client JSON is cast;
        -- referenced twice, so Postgres computes it once per call.
        SELECT pp.user_id::text AS key
        FROM player_profiles pp
        WHERE pp.user_id IS NOT NULL
        UNION
        SELECT g.created_by::text
        FROM games g
        WHERE g.created_by IS NOT NULL
    ),
    participant_rows AS (
        -- One row per (completed game x participant). No casts of client JSON.
        SELECT
            g.id                                    AS game_id,
            g.created_at                            AS game_created_at,
            lower(g.winner_id::text)                AS winner_key,
            lower(participant->>'id')               AS player_key,
            nullif(btrim(participant->>'name'), '') AS player_name,
            g.created_by::text                      AS writer_key,
            CASE
                WHEN participant->>'userId' ~*
                     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN lower(participant->>'userId')
            END                                     AS claimed_key
        FROM games g
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(g.participants) = 'array'
                 THEN g.participants
                 ELSE '[]'::jsonb END
        ) AS participant
        WHERE g.status = 'completed'
    ),
    keyed_rows AS (
        -- v6: user_key is the userId when it may group the player, NULL when
        -- the player falls back to participants[].id. Only the account itself
        -- can make created_by equal its uid (games_insert_authenticated,
        -- 00014); anyone can INSERT a game naming it in userId.
        SELECT
            pr.*,
            CASE
                WHEN pr.claimed_key IS NULL
                    THEN NULL                   -- no userId: by id
                WHEN NOT EXISTS (SELECT 1 FROM accounts a WHERE a.key = pr.claimed_key)
                    THEN pr.claimed_key         -- a guest id: by it
                WHEN pr.claimed_key = pr.writer_key
                    THEN pr.claimed_key         -- the account's own game
                ELSE NULL                       -- an account named by another
                                                -- writer: by id
            END AS user_key
        FROM participant_rows pr
    ),
    stable_rows AS (
        -- Grouping key: the userId where it counts, else the participant id
        SELECT *
        FROM (
            SELECT
                kr.*,
                COALESCE(kr.user_key, kr.player_key) AS stable_key
            FROM keyed_rows kr
        ) s
        -- Guard for the single ::uuid below. A participant with a junk id and
        -- no usable userId cannot be represented in the player_id UUID column
        -- anyway, so it drops out rather than aborting the whole call.
        WHERE s.stable_key ~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          -- v6: a participant keyed by its id where that id IS an account's
          -- drops out. Without this the forger moves the victim's uid from
          -- userId to id, and the row merges with the victim's and takes
          -- their profile name. Honest participant ids come from
          -- crypto.randomUUID() and never collide with an account.
          AND (s.user_key IS NOT NULL
               OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.key = s.player_key))
    ),
    action_rows AS (
        -- Actions counted once per (game, playerId), however many participants
        -- claim that id
        SELECT
            g.id                  AS game_id,
            lower(h->>'playerId') AS player_key,
            COUNT(*)                                           AS action_count,
            COUNT(*) FILTER (WHERE h->>'action' = 'pot_black') AS black_pot_count
        FROM games g
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(g.history) = 'array'
                 THEN g.history
                 ELSE '[]'::jsonb END
        ) AS h
        WHERE g.status = 'completed'
        GROUP BY g.id, lower(h->>'playerId')
    ),
    per_game AS (
        -- Collapse duplicate participants: one player, one row per game
        SELECT
            sr.stable_key,
            sr.game_id,
            min(sr.game_created_at) AS game_created_at,
            max(CASE WHEN sr.player_key = sr.winner_key THEN 1 ELSE 0 END) AS is_winner,
            (array_agg(sr.player_name ORDER BY sr.player_name)
               FILTER (WHERE sr.player_name IS NOT NULL))[1] AS player_name,
            (array_agg(sr.player_key))[1] AS player_key
        FROM stable_rows sr
        GROUP BY sr.stable_key, sr.game_id
    ),
    per_game_actions AS (
        SELECT
            pg.stable_key,
            pg.game_id,
            COALESCE(ar.action_count, 0)    AS action_count,
            COALESCE(ar.black_pot_count, 0) AS black_pot_count
        FROM per_game pg
        LEFT JOIN action_rows ar
               ON ar.game_id    = pg.game_id
              AND ar.player_key = pg.player_key
    ),
    aggregated_stats AS (
        SELECT
            pg.stable_key::uuid AS stable_id,   -- the only ::uuid; guarded above
            -- Name from the player's most recent game
            (array_agg(pg.player_name ORDER BY pg.game_created_at DESC, pg.game_id DESC)
               FILTER (WHERE pg.player_name IS NOT NULL))[1] AS latest_player_name,
            COUNT(*)::BIGINT                                 AS total_games,
            COUNT(*) FILTER (WHERE pg.is_winner = 1)::BIGINT AS games_won,
            (COUNT(*) - COUNT(*) FILTER (WHERE pg.is_winner = 1))::BIGINT AS games_lost,
            CASE
                WHEN COUNT(*) > 0
                THEN COUNT(*) FILTER (WHERE pg.is_winner = 1)::NUMERIC
                     / COUNT(*)::NUMERIC * 100
                ELSE 0
            END                                              AS win_rate,
            COALESCE(SUM(pga.action_count), 0)::BIGINT       AS total_actions,
            COALESCE(SUM(pga.black_pot_count), 0)::BIGINT    AS total_black_pots
        FROM per_game pg
        LEFT JOIN per_game_actions pga
               ON pga.stable_key = pg.stable_key
              AND pga.game_id    = pg.game_id
        GROUP BY pg.stable_key
    )
    -- The profile joins on stable_id. A guest's stable_id can no longer equal a
    -- profile's user_id (filtered in stable_rows), so a profile name only ever
    -- lands on the account's own row. player_profiles.user_id is UNIQUE
    -- (00003/00004), so this cannot multiply rows.
    SELECT
        a.stable_id AS player_id,
        COALESCE(pp.display_name, a.latest_player_name) AS display_name,
        pp.avatar_url,
        a.total_games,
        a.games_won,
        a.games_lost,
        ROUND(a.win_rate, 2) AS win_rate,
        a.total_actions,
        a.total_black_pots,
        ROW_NUMBER() OVER (
            ORDER BY a.win_rate    DESC,
                     a.games_won   DESC,
                     a.total_games DESC,
                     a.stable_id   ASC   -- deterministic tie-break, so equal
                                         -- players stop swapping places
        )::INTEGER AS rank
    FROM aggregated_stats a
    LEFT JOIN player_profiles pp ON pp.user_id = a.stable_id
    -- The qualifying minimum. Clamped like limit_count: the RPC is reachable by
    -- anon, and a negative or absurd value should not change what it means.
    WHERE a.total_games >= LEAST(GREATEST(COALESCE(min_games, 3), 1), 100)
    ORDER BY rank
    -- The client always asks for 15 (leaderboard-list.tsx). Clamped because the
    -- RPC is reachable by anon: NULL would mean "no limit" and a huge value a
    -- full scan.
    LIMIT LEAST(GREATEST(COALESCE(limit_count, 15), 0), 100);
END;
$$ LANGUAGE plpgsql STABLE;

-- CREATE OR REPLACE kept the 00013 grants; re-issued so this file stands alone
GRANT EXECUTE ON FUNCTION get_leaderboard(INTEGER, INTEGER) TO authenticated, anon;

-- ====================================
-- COMMENTS
-- ====================================

COMMENT ON FUNCTION games_server_timestamps() IS
'BEFORE INSERT OR UPDATE on games. INSERT: created_at := LEAST(COALESCE(created_at, now()), now()), updated_at := now(). UPDATE: created_at is kept, updated_at := now() — except when created_by goes from an account to NULL (ON DELETE SET NULL), which keeps updated_at and retires an active game to abandoned. Replaces update_games_updated_at (00001).';

COMMENT ON POLICY "games_update_anon" ON games IS
'Guests may update unowned games for 24 hours from the server-side created_at, and a finished (completed or abandoned) game only within an hour of its last write — room for the racing completion writes and undo-and-replay. After that the row is read-only for anon. Not a boundary against a live spectator: host and spectator are the same anon role with the same knowledge.';

COMMENT ON CONSTRAINT games_participants_max ON games IS
'At most 32 participants. The client sets no cap; get_leaderboard unrolls participants of every completed game on every call.';

COMMENT ON CONSTRAINT games_history_max ON games IS
'At most 1000 history entries — several times the longest plausible game.';

COMMENT ON CONSTRAINT games_payload_size ON games IS
'participants + history at most 512 KiB as JSON text (octet_length, so the result does not depend on TOAST compression).';

COMMENT ON CONSTRAINT games_winner_is_participant ON games IS
'winner_id is NULL or the id of one of the participants (compared lower-cased, like get_leaderboard).';

COMMENT ON POLICY "Users can insert their own profile" ON player_profiles IS
'Signed-in users only, and only their own profile. 00001 allowed anyone, including anon, to insert profiles with user_id NULL — unlimited, since UNIQUE admits any number of NULLs.';

COMMENT ON INDEX idx_rulesets_one_default IS
'At most one default ruleset. Replaces the non-unique idx_rulesets_is_default (00001).';

COMMENT ON FUNCTION check_achievements IS
'Checks and grants achievements after game completion (v3: only games with created_by = p_user_id count — the game itself, total wins, streak, social; perfect_game needs at least one history entry by the winner. v2: caller must be auth.uid(), fixed casts, winner stats, streaks).';

COMMENT ON FUNCTION get_leaderboard IS
'Returns top N players ranked by win rate, among those who have played at least min_games (default 3). v6: a participants[].userId that is an account (player_profiles.user_id or games.created_by) groups the player only when it equals the row''s created_by, else the participant is grouped by participants[].id; a userId that is no account (a device guest id) groups the player as before; a participant grouped by an id that is an account is dropped. No casts of client-controlled JSON; the single ::uuid is regex-guarded in CTE stable_rows.';
