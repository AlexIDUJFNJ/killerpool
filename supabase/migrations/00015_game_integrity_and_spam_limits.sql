-- ====================================
-- Killerpool Database Schema
-- Migration: 00015_game_integrity_and_spam_limits
-- Description: the server owns a game's dates, a guest game has a finite
--              writable life, a game row has a size and its winner is one of
--              its players, and the profile / ruleset / perfect_game loose
--              ends are closed.
-- ====================================
--
-- Seven holes left after 00014. Each section names the hole, the fix, and what
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
-- requires at least one entry. Everything else is v2 verbatim, including
-- SECURITY DEFINER, the search_path, the p_user_id = auth.uid() guard and the
-- grants (re-issued below; CREATE OR REPLACE would keep them anyway).
--
-- WHAT THIS DELIBERATELY DOES NOT FIX
--
--  * A spectator can still rewrite a LIVE guest game whose id they know.
--    Host and spectator are the same anon role with the same knowledge; only
--    a secret the host holds can separate them (new column + RPC + client).
--  * anon can still INSERT a fabricated completed game with any participants
--    and any participants[].userId, so get_leaderboard and the aggregates of
--    check_achievements (total wins, streak, social games) stay forgeable. The
--    date clamp only stops such a game from being newest forever; it can still
--    be newest now, so a planted loss still breaks a streak until the victim's
--    next win.
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
-- 00001); re-run section 4 of 00011 (check_achievements v2).

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
-- PART 5 — check_achievements v3: no perfect game without a shot
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

  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id AND status = 'completed';

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

  -- Total wins across all completed games where this user's participant won.
  -- The @> prefilter narrows to the user's games via the GIN index.
  SELECT COUNT(*) INTO v_total_wins
  FROM games g
  WHERE g.status = 'completed'
    AND g.winner_id IS NOT NULL
    AND g.participants @> v_user_elem
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(g.participants) p
      WHERE p->>'id' = g.winner_id::TEXT
        AND p->>'userId' = p_user_id::TEXT
    );

  -- Current win streak: leading wins in the user's completed games, newest first.
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
      AND g.participants @> v_user_elem
  ) t
  WHERE t.won AND t.losses_so_far = 0;

  -- Completed games with 4+ players where the user participated.
  SELECT COUNT(*) INTO v_social_games
  FROM games g
  WHERE g.status = 'completed'
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
'Checks and grants achievements after game completion (v3: perfect_game needs at least one history entry by the winner; v2: caller must be auth.uid(), fixed casts, winner stats, streaks).';
