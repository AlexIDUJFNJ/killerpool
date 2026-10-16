-- ====================================
-- Debug queries for leaderboard issue
-- Run these queries in Supabase SQL Editor to diagnose the problem
--
-- Read-only: every statement here is a SELECT, and it has to stay that way.
-- This file is pasted by hand into the production database; anything that
-- writes belongs in a migration. Nothing here runs automatically: the
-- Supabase CLI applies supabase/migrations/ only.
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
--
-- Since 00013 it ranks only players with at least min_games completed games
-- (default 3, which is what the client uses). Someone missing from the first
-- result but present in the second is below the minimum, not lost.
SELECT * FROM get_leaderboard(15);
SELECT * FROM get_leaderboard(15, 1);   -- same, without the qualifying minimum

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
--
-- Lists everyone, including players below get_leaderboard's qualifying
-- minimum (00013: min_games, default 3), and orders the way v5 ranks: win
-- rate, then wins, then games. `qualifies` and `games_to_qualify` say why a
-- player with games on record is not on the table.
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
),
per_player AS (
    SELECT
        COALESCE(pgs.user_key, pgs.player_key) AS stable_key,
        MAX(pgs.player_name) AS player_name,
        pgs.user_key,
        COUNT(DISTINCT pgs.game_id)::BIGINT AS total_games,
        COUNT(DISTINCT pgs.game_id) FILTER (WHERE pgs.is_winner = 1)::BIGINT AS games_won
    FROM player_game_stats pgs
    GROUP BY COALESCE(pgs.user_key, pgs.player_key), pgs.user_key
)
SELECT
    p.stable_key,
    COALESCE(pp.display_name, p.player_name) AS display_name,
    p.user_key,
    p.total_games,
    p.games_won,
    ROUND(p.games_won::NUMERIC / p.total_games * 100, 2) AS win_rate,
    -- 3 is get_leaderboard's default min_games, the one the client gets
    p.total_games >= 3              AS qualifies,
    GREATEST(3 - p.total_games, 0)  AS games_to_qualify
FROM per_player p
LEFT JOIN player_profiles pp ON p.user_key = pp.user_id::text
ORDER BY qualifies DESC, win_rate DESC, games_won DESC, total_games DESC;

-- 7. Participants whose id is not a UUID — these used to break get_leaderboard
--    for everyone before 00012
SELECT g.id AS game_id, participant->>'id' AS bad_id, participant->>'name' AS name
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE g.status = 'completed'
  AND (participant->>'id') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
