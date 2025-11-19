-- ====================================
-- Debug queries for leaderboard issue
-- Run these queries in Supabase SQL Editor to diagnose the problem
-- ====================================

-- 1. Check if there are any completed games
SELECT
    id,
    status,
    winner_id,
    created_at,
    created_by,
    jsonb_array_length(participants) as player_count,
    jsonb_array_length(history) as action_count
FROM games
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 10;

-- 2. Check structure of participants in completed games
SELECT
    id,
    status,
    jsonb_pretty(participants) as participants_structure
FROM games
WHERE status = 'completed'
LIMIT 1;

-- 3. Test extracting user_id from participants
SELECT
    g.id as game_id,
    participant->>'id' as player_id,
    participant->>'name' as player_name,
    participant->>'userId' as user_id,
    g.winner_id
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE g.status = 'completed'
LIMIT 10;

-- 4. Test the get_leaderboard function directly
SELECT * FROM get_leaderboard(15);

-- 5. Check if any player_profiles exist
SELECT
    user_id,
    display_name,
    avatar_url,
    created_at
FROM player_profiles
LIMIT 10;

-- 6. Manual leaderboard query (simplified)
WITH player_game_stats AS (
    SELECT
        (participant->>'id')::uuid AS player_id,
        participant->>'name' AS player_name,
        (participant->>'userId')::uuid AS user_id,
        g.id AS game_id,
        g.winner_id,
        CASE
            WHEN (participant->>'id')::uuid = g.winner_id THEN 1
            ELSE 0
        END AS is_winner
    FROM games g,
    LATERAL jsonb_array_elements(g.participants) AS participant
    WHERE g.status = 'completed'
)
SELECT
    pgs.player_id,
    MAX(pgs.player_name) as player_name,
    pgs.user_id,
    COUNT(DISTINCT pgs.game_id)::BIGINT AS total_games,
    SUM(pgs.is_winner)::BIGINT AS games_won,
    COALESCE(pp.display_name, MAX(pgs.player_name)) as display_name
FROM player_game_stats pgs
LEFT JOIN player_profiles pp ON pgs.user_id = pp.user_id
GROUP BY pgs.player_id, pgs.user_id, pp.display_name
ORDER BY games_won DESC, total_games DESC;
