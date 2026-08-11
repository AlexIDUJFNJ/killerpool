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
--
-- Ids are compared as text, never cast. participants comes from clients —
-- including anonymous ones — so a single non-UUID id would abort the whole
-- query with 22P02, which is exactly the bug migration 00012 fixed in
-- get_leaderboard itself. Do not "simplify" this back to ::uuid.
WITH player_game_stats AS (
    SELECT
        lower(participant->>'id')   AS player_key,
        participant->>'name'        AS player_name,
        CASE
            WHEN participant->>'userId' ~*
                 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN lower(participant->>'userId')
        END                         AS user_key,
        g.id AS game_id,
        CASE
            WHEN lower(participant->>'id') = lower(g.winner_id::text) THEN 1
            ELSE 0
        END AS is_winner
    FROM games g,
    LATERAL jsonb_array_elements(g.participants) AS participant
    WHERE g.status = 'completed'
)
SELECT
    COALESCE(pgs.user_key, pgs.player_key) AS stable_key,
    MAX(pgs.player_name) as player_name,
    pgs.user_key,
    COUNT(DISTINCT pgs.game_id)::BIGINT AS total_games,
    COUNT(DISTINCT pgs.game_id) FILTER (WHERE pgs.is_winner = 1)::BIGINT AS games_won,
    COALESCE(pp.display_name, MAX(pgs.player_name)) as display_name
FROM player_game_stats pgs
LEFT JOIN player_profiles pp ON pgs.user_key = pp.user_id::text
GROUP BY COALESCE(pgs.user_key, pgs.player_key), pgs.user_key, pp.display_name
ORDER BY games_won DESC, total_games DESC;

-- 7. Participants whose id is not a UUID — these used to break get_leaderboard
--    for everyone before 00012
SELECT g.id AS game_id, participant->>'id' AS bad_id, participant->>'name' AS name
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE g.status = 'completed'
  AND (participant->>'id') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
