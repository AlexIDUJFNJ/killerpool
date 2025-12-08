-- ====================================
-- Killerpool Database Schema
-- Migration: 00005_fix_leaderboard_grouping
-- Description: Fix leaderboard to group by user_id instead of player_id
-- This fixes the issue where one player appears multiple times in leaderboard
-- ====================================

-- ====================================
-- DROP and recreate get_leaderboard function with correct grouping
-- ====================================

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
)
SECURITY DEFINER  -- Run with owner's privileges, bypassing RLS
SET search_path = public  -- Security best practice
AS $$
BEGIN
    RETURN QUERY
    WITH player_game_stats AS (
        -- Extract all players from completed games
        -- Use user_id as the stable identifier (falls back to player_id for old data)
        SELECT
            (participant->>'id')::uuid AS player_id,
            participant->>'name' AS player_name,
            -- Try to parse userId as UUID, return NULL if invalid (e.g., "guest_xxx")
            CASE
                WHEN participant->>'userId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (participant->>'userId')::uuid
                ELSE NULL
            END AS user_id,
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
    -- Create a stable identifier for grouping
    -- Use user_id if available (valid UUID), otherwise use player_id
    player_with_stable_id AS (
        SELECT
            pgs.*,
            COALESCE(pgs.user_id, pgs.player_id) AS stable_id
        FROM player_game_stats pgs
    ),
    player_actions AS (
        -- Count actions per player per game
        SELECT
            pws.stable_id,
            pws.game_id,
            COUNT(CASE WHEN (action->>'action') = 'pot_black' THEN 1 END) AS black_pots,
            COUNT(*) AS total_game_actions
        FROM player_with_stable_id pws,
        LATERAL jsonb_array_elements(pws.history) AS action
        WHERE (action->>'playerId')::uuid = pws.player_id
        GROUP BY pws.stable_id, pws.game_id
    ),
    aggregated_stats AS (
        -- Aggregate stats per player (grouped by stable_id)
        SELECT
            pws.stable_id AS player_id,  -- Return stable_id as player_id
            -- Get display name: prefer profile name, then most recent player name
            COALESCE(
                pp.display_name,
                (SELECT pn.player_name
                 FROM player_with_stable_id pn
                 WHERE pn.stable_id = pws.stable_id
                 ORDER BY pn.game_id DESC
                 LIMIT 1)
            ) AS display_name,
            pp.avatar_url,
            COUNT(DISTINCT pws.game_id)::BIGINT AS total_games,
            SUM(pws.is_winner)::BIGINT AS games_won,
            (COUNT(DISTINCT pws.game_id) - SUM(pws.is_winner))::BIGINT AS games_lost,
            CASE
                WHEN COUNT(DISTINCT pws.game_id) > 0
                THEN (SUM(pws.is_winner)::NUMERIC / COUNT(DISTINCT pws.game_id)::NUMERIC * 100)
                ELSE 0
            END AS win_rate,
            COALESCE(SUM(pa.total_game_actions), 0)::BIGINT AS total_actions,
            COALESCE(SUM(pa.black_pots), 0)::BIGINT AS total_black_pots
        FROM player_with_stable_id pws
        LEFT JOIN player_profiles pp ON pws.user_id = pp.user_id
        LEFT JOIN player_actions pa ON pws.stable_id = pa.stable_id AND pws.game_id = pa.game_id
        GROUP BY pws.stable_id, pp.display_name, pp.avatar_url
        HAVING COUNT(DISTINCT pws.game_id) > 0
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

COMMENT ON FUNCTION get_leaderboard IS 'Returns top N players ranked by win rate and total wins. Groups by user_id (stable identifier) instead of player_id to properly aggregate stats for the same player across multiple games.';

-- ====================================
-- GRANT PERMISSIONS
-- ====================================

-- Allow authenticated and anonymous users to call this function
GRANT EXECUTE ON FUNCTION get_leaderboard TO authenticated, anon;
