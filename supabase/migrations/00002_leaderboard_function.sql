-- ====================================
-- Killerpool Database Schema
-- Migration: 00002_leaderboard_function
-- Description: Add leaderboard function to calculate top players
-- ====================================

-- ====================================
-- LEADERBOARD FUNCTION
-- ====================================

-- Function to get leaderboard (top players by win rate and total wins)
-- Returns top N players with their statistics
CREATE OR REPLACE FUNCTION get_leaderboard(limit_count INTEGER DEFAULT 15)
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
) AS $$
BEGIN
    RETURN QUERY
    WITH player_game_stats AS (
        -- Extract all players from completed games
        SELECT
            (participant->>'id')::uuid AS player_id,
            participant->>'name' AS player_name,
            (participant->>'userId')::uuid AS user_id,
            g.id AS game_id,
            g.winner_id,
            g.history,
            CASE
                WHEN (participant->>'id')::uuid = g.winner_id THEN 1
                ELSE 0
            END AS is_winner
        FROM games g,
        LATERAL jsonb_array_elements(g.participants) AS participant
        WHERE g.status = 'completed'
    ),
    player_actions AS (
        -- Count actions per player per game
        SELECT
            pgs.player_id,
            pgs.player_name,
            pgs.user_id,
            pgs.game_id,
            COUNT(CASE WHEN (action->>'action') = 'pot_black' THEN 1 END) AS black_pots,
            COUNT(*) AS total_game_actions
        FROM player_game_stats pgs,
        LATERAL jsonb_array_elements(pgs.history) AS action
        WHERE (action->>'playerId')::uuid = pgs.player_id
        GROUP BY pgs.player_id, pgs.player_name, pgs.user_id, pgs.game_id
    ),
    aggregated_stats AS (
        -- Aggregate stats per player
        SELECT
            pgs.player_id,
            COALESCE(pp.display_name, MAX(pgs.player_name)) AS display_name,
            pp.avatar_url,
            COUNT(DISTINCT pgs.game_id) AS total_games,
            SUM(pgs.is_winner) AS games_won,
            COUNT(DISTINCT pgs.game_id) - SUM(pgs.is_winner) AS games_lost,
            CASE
                WHEN COUNT(DISTINCT pgs.game_id) > 0
                THEN (SUM(pgs.is_winner)::NUMERIC / COUNT(DISTINCT pgs.game_id)::NUMERIC * 100)
                ELSE 0
            END AS win_rate,
            COALESCE(SUM(pa.total_game_actions), 0) AS total_actions,
            COALESCE(SUM(pa.black_pots), 0) AS total_black_pots
        FROM player_game_stats pgs
        LEFT JOIN player_profiles pp ON pgs.user_id = pp.user_id
        LEFT JOIN player_actions pa ON pgs.player_id = pa.player_id AND pgs.game_id = pa.game_id
        GROUP BY pgs.player_id, pp.display_name, pp.avatar_url
        HAVING COUNT(DISTINCT pgs.game_id) > 0
    )
    -- Get top N players, ranked by win rate (descending), then by total wins (descending)
    SELECT
        a.player_id,
        a.display_name,
        a.avatar_url,
        a.total_games,
        a.games_won,
        a.games_lost,
        ROUND(a.win_rate, 2) AS win_rate,
        a.total_actions,
        a.total_black_pots,
        ROW_NUMBER() OVER (ORDER BY a.win_rate DESC, a.games_won DESC, a.total_games DESC)::INTEGER AS rank
    FROM aggregated_stats a
    ORDER BY rank
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ====================================
-- COMMENTS
-- ====================================

COMMENT ON FUNCTION get_leaderboard IS 'Returns top N players ranked by win rate and total wins from completed games';

-- ====================================
-- GRANT PERMISSIONS
-- ====================================

-- Allow authenticated and anonymous users to call this function
GRANT EXECUTE ON FUNCTION get_leaderboard TO authenticated, anon;
