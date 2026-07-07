-- Fix achievements system and align defaults with the client
--
-- 1) The seeded "Classic Killer Pool" ruleset had max_lives 10, while the client
--    DEFAULT_RULESET uses 6 (see lib/types.ts). Align the database with the client.
-- 2) user_achievements policies: the INSERT policy named "Service role can insert
--    achievements" actually allowed any authenticated user to insert arbitrary
--    achievements for themselves (WITH CHECK auth.uid() = user_id) — a cheat vector.
--    check_achievements() runs as SECURITY DEFINER and bypasses RLS, so no INSERT
--    policy is needed at all. The "view own" SELECT policy is redundant next to
--    "view all".
-- 3) check_achievements() v1 (00007) failed at runtime: `winner_id = (p->>'id')::TEXT`
--    compares uuid with text (no such operator), `(ruleset_id)::INTEGER` is an
--    invalid cast, and survivor read the lives of the FIRST participant instead of
--    the winner. It also never revoked the default PUBLIC EXECUTE and trusted the
--    caller-supplied p_user_id — any client could grant achievements to any user.
--    This rewrite:
--      - compares participant ids as text (no casts on client-controlled JSON),
--      - guards every ::INTEGER cast behind a numeric regex (games are writable
--        by anon, so hostile/corrupt JSON must not abort the whole call),
--      - reads the winner's own stats,
--      - requires p_user_id = auth.uid() and revokes EXECUTE from PUBLIC/anon,
--      - adds the achievement types the client defines but v1 never granted:
--        perfect_game, win_streak_3, win_streak_5.

-- ====================================
-- 1) Align default ruleset with client
-- ====================================

UPDATE rulesets
SET params = jsonb_set(params, '{max_lives}', '6'::jsonb)
WHERE is_default = TRUE
  AND params->>'max_lives' = '10';

-- ====================================
-- 2) Tighten user_achievements policies
-- ====================================

DROP POLICY IF EXISTS "Service role can insert achievements" ON user_achievements;
DROP POLICY IF EXISTS "Users can view own achievements" ON user_achievements;
-- Remaining policy: "Users can view all achievements" (SELECT USING true).
-- Writes happen only through check_achievements() (SECURITY DEFINER).

-- ====================================
-- 3) Index for per-user game lookups
-- ====================================

-- check_achievements prefilters games by participant userId via jsonb
-- containment; jsonb_path_ops GIN supports the @> operator
CREATE INDEX IF NOT EXISTS idx_games_participants_gin
  ON games USING GIN (participants jsonb_path_ops);

-- ====================================
-- 4) Rewrite check_achievements
-- ====================================

CREATE OR REPLACE FUNCTION check_achievements(p_user_id UUID, p_game_id UUID)
RETURNS TABLE(achievement_type TEXT, is_new BOOLEAN) AS $$
#variable_conflict use_variable
DECLARE
  v_game games%ROWTYPE;
  v_user_elem JSONB;
  v_winner_id TEXT;
  v_winner_lives INTEGER;
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
  -- belongs to the calling user. participants[].userId is set for the
  -- authenticated host only (see createGame in lib/game-logic.ts).
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
    COUNT(*) FILTER (WHERE h->>'action' = 'pot_black'),
    COUNT(*) FILTER (WHERE CASE
      WHEN (h->>'livesAfter') ~ '^-?[0-9]+$' AND (h->>'livesBefore') ~ '^-?[0-9]+$'
      THEN (h->>'livesAfter')::INTEGER < (h->>'livesBefore')::INTEGER
      ELSE FALSE END),
    COUNT(*) FILTER (WHERE NOT (
      (h->>'livesAfter') ~ '^-?[0-9]+$' AND (h->>'livesBefore') ~ '^-?[0-9]+$'))
  INTO v_pot_blacks, v_lost_lives, v_malformed
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
  -- perfect_game requires a fully well-formed history: entries missing numeric
  -- livesBefore/livesAfter must not count as "no lives lost"
  IF v_lost_lives = 0 AND v_malformed = 0 THEN v_earned := v_earned || 'perfect_game'::TEXT; END IF;
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

-- Default EXECUTE is granted to PUBLIC on function creation — revoke it so the
-- RPC is callable by authenticated users only (00007 never did this)
REVOKE EXECUTE ON FUNCTION check_achievements(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_achievements(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION check_achievements(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_achievements(UUID, UUID) TO service_role;

COMMENT ON FUNCTION check_achievements IS 'Checks and grants achievements after game completion (v2: caller must be auth.uid(), fixed casts, winner stats, streaks, perfect_game)';
