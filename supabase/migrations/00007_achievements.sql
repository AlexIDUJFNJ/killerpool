-- Achievements system for Killerpool
-- This migration creates the achievements table and related functions

-- Create achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,

  -- Ensure each user can only have each achievement once
  UNIQUE(user_id, achievement_type)
);

-- Create index for faster lookups
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_type ON user_achievements(achievement_type);

-- Enable RLS
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own achievements
CREATE POLICY "Users can view own achievements"
  ON user_achievements
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can view others' achievements (for profile pages)
CREATE POLICY "Users can view all achievements"
  ON user_achievements
  FOR SELECT
  USING (true);

-- Policy: Only backend can insert achievements (via service role)
CREATE POLICY "Service role can insert achievements"
  ON user_achievements
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to check and grant achievements after game completion
CREATE OR REPLACE FUNCTION check_achievements(p_user_id UUID, p_game_id UUID)
RETURNS TABLE(achievement_type TEXT, is_new BOOLEAN) AS $$
DECLARE
  v_total_wins INTEGER;
  v_current_streak INTEGER;
  v_winner_lives INTEGER;
  v_starting_lives INTEGER;
  v_pot_blacks INTEGER;
  v_player_count INTEGER;
  v_social_games INTEGER;
  v_is_winner BOOLEAN;
BEGIN
  -- Get game stats
  SELECT
    (participants->0->>'lives')::INTEGER,
    jsonb_array_length(participants),
    (SELECT COUNT(*) FROM jsonb_array_elements(history) h WHERE h->>'action' = 'pot_black' AND h->>'playerId' = (
      SELECT p->>'id' FROM jsonb_array_elements(participants) p WHERE p->>'userId' = p_user_id::TEXT LIMIT 1
    ))
  INTO v_winner_lives, v_player_count, v_pot_blacks
  FROM games
  WHERE id = p_game_id;

  -- Check if user is the winner
  SELECT EXISTS(
    SELECT 1 FROM games g
    WHERE g.id = p_game_id
    AND g.winner_id = (
      SELECT (p->>'id')::TEXT FROM jsonb_array_elements(g.participants) p
      WHERE p->>'userId' = p_user_id::TEXT LIMIT 1
    )
  ) INTO v_is_winner;

  IF NOT v_is_winner THEN
    RETURN;
  END IF;

  -- Get starting lives from ruleset
  SELECT COALESCE((ruleset_id)::INTEGER, 3) INTO v_starting_lives FROM games WHERE id = p_game_id;
  v_starting_lives := 3; -- Default

  -- Count total wins
  SELECT COUNT(*) INTO v_total_wins
  FROM games g
  WHERE g.status = 'completed'
  AND g.winner_id = (
    SELECT (p->>'id')::TEXT FROM jsonb_array_elements(g.participants) p
    WHERE p->>'userId' = p_user_id::TEXT LIMIT 1
  );

  -- Check first_win
  IF v_total_wins = 1 THEN
    INSERT INTO user_achievements (user_id, achievement_type, game_id)
    VALUES (p_user_id, 'first_win', p_game_id)
    ON CONFLICT (user_id, achievement_type) DO NOTHING;
    IF FOUND THEN
      achievement_type := 'first_win';
      is_new := TRUE;
      RETURN NEXT;
    END IF;
  END IF;

  -- Check wins milestones
  IF v_total_wins >= 10 THEN
    INSERT INTO user_achievements (user_id, achievement_type, game_id)
    VALUES (p_user_id, 'wins_10', p_game_id)
    ON CONFLICT (user_id, achievement_type) DO NOTHING;
    IF FOUND THEN
      achievement_type := 'wins_10';
      is_new := TRUE;
      RETURN NEXT;
    END IF;
  END IF;

  IF v_total_wins >= 25 THEN
    INSERT INTO user_achievements (user_id, achievement_type, game_id)
    VALUES (p_user_id, 'wins_25', p_game_id)
    ON CONFLICT (user_id, achievement_type) DO NOTHING;
    IF FOUND THEN
      achievement_type := 'wins_25';
      is_new := TRUE;
      RETURN NEXT;
    END IF;
  END IF;

  IF v_total_wins >= 50 THEN
    INSERT INTO user_achievements (user_id, achievement_type, game_id)
    VALUES (p_user_id, 'wins_50', p_game_id)
    ON CONFLICT (user_id, achievement_type) DO NOTHING;
    IF FOUND THEN
      achievement_type := 'wins_50';
      is_new := TRUE;
      RETURN NEXT;
    END IF;
  END IF;

  -- Check survivor (win with 1 life)
  IF v_winner_lives = 1 THEN
    INSERT INTO user_achievements (user_id, achievement_type, game_id)
    VALUES (p_user_id, 'survivor', p_game_id)
    ON CONFLICT (user_id, achievement_type) DO NOTHING;
    IF FOUND THEN
      achievement_type := 'survivor';
      is_new := TRUE;
      RETURN NEXT;
    END IF;
  END IF;

  -- Check pot_black_master (5+ pot blacks)
  IF v_pot_blacks >= 5 THEN
    INSERT INTO user_achievements (user_id, achievement_type, game_id)
    VALUES (p_user_id, 'pot_black_master', p_game_id)
    ON CONFLICT (user_id, achievement_type) DO NOTHING;
    IF FOUND THEN
      achievement_type := 'pot_black_master';
      is_new := TRUE;
      RETURN NEXT;
    END IF;
  END IF;

  -- Check social_player (10 games with 4+ players)
  SELECT COUNT(*) INTO v_social_games
  FROM games g
  WHERE g.status = 'completed'
  AND jsonb_array_length(g.participants) >= 4
  AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(g.participants) p
    WHERE p->>'userId' = p_user_id::TEXT
  );

  IF v_social_games >= 10 THEN
    INSERT INTO user_achievements (user_id, achievement_type, game_id)
    VALUES (p_user_id, 'social_player', p_game_id)
    ON CONFLICT (user_id, achievement_type) DO NOTHING;
    IF FOUND THEN
      achievement_type := 'social_player';
      is_new := TRUE;
      RETURN NEXT;
    END IF;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_achievements(UUID, UUID) TO authenticated;

-- Comment
COMMENT ON TABLE user_achievements IS 'Stores unlocked achievements for each user';
COMMENT ON FUNCTION check_achievements IS 'Checks and grants achievements after game completion';
