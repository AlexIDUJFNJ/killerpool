-- ====================================
-- Debug queries for leaderboard issue
-- Run these queries in Supabase SQL Editor to diagnose the problem
--
-- Read-only: every statement here is a SELECT, and it has to stay that way.
-- This file is pasted by hand into the production database; anything that
-- writes belongs in a migration. Nothing here runs automatically: the
-- Supabase CLI applies supabase/migrations/ only.
--
-- The manual queries (6 and 8) follow get_leaderboard v6
-- (00015_game_integrity_and_spam_limits.sql, PART 6). When the function
-- changes, change them with it: a debug query that groups players differently
-- from the real one sends the search the wrong way.
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
--
-- created_by is who wrote the row. Since v6 a userId that is an account's uid
-- counts only in that account's own rows (query 8 lists the rest).
SELECT
    g.id as game_id,
    participant->>'id' as player_id,
    participant->>'name' as player_name,
    participant->>'userId' as user_id,
    g.created_by,
    g.winner_id
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE g.status = 'completed'
LIMIT 10;

-- 4. Test the get_leaderboard function directly
--
-- Since 00013 it ranks only players with at least min_games completed games
-- (default 3, which is what the client uses). Someone missing from the first
-- result but present in the second is below the minimum, not lost. Both
-- clamp: limit_count to 0..100, min_games to 1..100.
SELECT * FROM get_leaderboard(15);
SELECT * FROM get_leaderboard(100, 1);   -- everyone, without the qualifying minimum

-- 5. Check if any player_profiles exist
SELECT
    user_id,
    display_name,
    avatar_url,
    created_at
FROM player_profiles
LIMIT 10;

-- 6. Manual leaderboard query (get_leaderboard v6, without the minimum)
--
-- Ids are compared as text, never cast. participants comes from clients —
-- including anonymous ones — so a single non-UUID id would abort the whole
-- query with 22P02, which is exactly the bug migration 00012 fixed in
-- get_leaderboard itself. Do not "simplify" this back to ::uuid.
--
-- Grouping key of a participant, as in v6:
--   userId empty / not a uuid               -> participants[].id
--   userId is no account (a device guest id) -> userId
--   userId is an account, created_by = it    -> userId
--   userId is an account, created_by is not  -> participants[].id
-- and a participant grouped by an id that IS an account's uid is not counted
-- at all. "An account" is a uid in player_profiles.user_id or
-- games.created_by. A participant whose key is not a UUID drops out too.
--
-- Lists everyone, including players below get_leaderboard's qualifying
-- minimum (00013: min_games, default 3), ranked the way v6 ranks: win rate,
-- then wins, then games, then the key. `qualifies` and `games_to_qualify` say
-- why a player with games on record is not on the table, `grouped_by` which
-- rule above made their row. Without the minimum the columns it shares with
-- get_leaderboard(100, 1) — key, name, games, wins, win rate, order — are the
-- same (actions and black pots are left out).
WITH accounts AS (
    SELECT pp.user_id::text AS key FROM player_profiles pp WHERE pp.user_id IS NOT NULL
    UNION
    SELECT g.created_by::text FROM games g WHERE g.created_by IS NOT NULL
),
participant_rows AS (
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
    SELECT
        pr.*,
        CASE
            WHEN pr.claimed_key IS NULL
                THEN NULL
            WHEN NOT EXISTS (SELECT 1 FROM accounts a WHERE a.key = pr.claimed_key)
                THEN pr.claimed_key
            WHEN pr.claimed_key = pr.writer_key
                THEN pr.claimed_key
        END AS user_key,
        CASE
            WHEN pr.claimed_key IS NULL
                THEN 'id'
            WHEN NOT EXISTS (SELECT 1 FROM accounts a WHERE a.key = pr.claimed_key)
                THEN 'userId (guest)'
            WHEN pr.claimed_key = pr.writer_key
                THEN 'userId (account)'
            ELSE 'id (account userId, written by another)'
        END AS grouped_by
    FROM participant_rows pr
),
per_game AS (
    -- One row per player per game, however many times the game lists them
    SELECT
        COALESCE(kr.user_key, kr.player_key)                             AS stable_key,
        kr.game_id,
        min(kr.game_created_at)                                          AS game_created_at,
        max(CASE WHEN kr.player_key = kr.winner_key THEN 1 ELSE 0 END)   AS is_winner,
        min(kr.player_name)                                              AS player_name,
        string_agg(DISTINCT kr.grouped_by, ', ')                         AS grouped_by
    FROM keyed_rows kr
    WHERE COALESCE(kr.user_key, kr.player_key) ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (kr.user_key IS NOT NULL
           OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.key = kr.player_key))
    GROUP BY COALESCE(kr.user_key, kr.player_key), kr.game_id
),
per_player AS (
    SELECT
        pg.stable_key,
        -- Fallback name: the one from the player's most recent game
        (array_agg(pg.player_name ORDER BY pg.game_created_at DESC, pg.game_id DESC)
           FILTER (WHERE pg.player_name IS NOT NULL))[1]                 AS latest_player_name,
        string_agg(DISTINCT pg.grouped_by, ', ')                         AS grouped_by,
        COUNT(*)::BIGINT                                                 AS total_games,
        COUNT(*) FILTER (WHERE pg.is_winner = 1)::BIGINT                 AS games_won
    FROM per_game pg
    GROUP BY pg.stable_key
)
SELECT
    p.stable_key,
    COALESCE(pp.display_name, p.latest_player_name) AS display_name,
    p.grouped_by,
    p.total_games,
    p.games_won,
    ROUND(p.games_won::NUMERIC / p.total_games * 100, 2) AS win_rate,
    -- 3 is get_leaderboard's default min_games, the one the client gets
    p.total_games >= 3              AS qualifies,
    GREATEST(3 - p.total_games, 0)  AS games_to_qualify
FROM per_player p
LEFT JOIN player_profiles pp ON pp.user_id::text = p.stable_key
ORDER BY qualifies DESC,
         p.games_won::NUMERIC / p.total_games DESC,   -- unrounded, like v6
         p.games_won DESC,
         p.total_games DESC,
         p.stable_key COLLATE "C";                    -- the uuid order of v6

-- 7. Participants whose id is not a UUID. Before 00012 one of these broke
--    get_leaderboard for everyone; now such a participant is left out, unless
--    a userId groups them (query 6)
SELECT g.id AS game_id, participant->>'id' AS bad_id, participant->>'name' AS name,
       participant->>'userId' AS user_id
FROM games g,
LATERAL jsonb_array_elements(g.participants) AS participant
WHERE g.status = 'completed'
  AND (participant->>'id') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 8. Participants v6 does not count under an account (00015)
--
-- "Where did my win go": a game that names an account in userId counts for
-- that account only when the account wrote the row. Anyone may INSERT a game
-- naming any userId, so a row written by someone else — a forgery, or a game
-- created under the account but written anonymously by an older client — is
-- not believed:
--   regrouped — the userId is an account and created_by is another writer (or
--               NULL): the participant counts under their participants[].id,
--               as a separate leaderboard row;
--   dropped   — the participant would be grouped by an id that is an
--               account's uid: not counted at all.
-- A participant can be both. A guest game adopted on its first INSERT after
-- signing in carries the device guest id, not the account, in userId, so it
-- is not listed here: it keeps counting under the guest id.
WITH accounts AS (
    SELECT pp.user_id::text AS key FROM player_profiles pp WHERE pp.user_id IS NOT NULL
    UNION
    SELECT g.created_by::text FROM games g WHERE g.created_by IS NOT NULL
),
participant_rows AS (
    SELECT
        g.id                      AS game_id,
        g.created_at,
        g.created_by,
        participant->>'id'        AS participant_id,
        participant->>'userId'    AS user_id,
        participant->>'name'      AS name,
        lower(participant->>'id') AS player_key,
        CASE
            WHEN participant->>'userId' ~*
                 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN lower(participant->>'userId')
        END                       AS claimed_key
    FROM games g
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(g.participants) = 'array'
             THEN g.participants
             ELSE '[]'::jsonb END
    ) AS participant
    WHERE g.status = 'completed'
),
believed AS (
    -- grouped by userId in query 6. Never NULL: created_by often is, hence
    -- IS NOT DISTINCT FROM rather than =
    SELECT
        pr.*,
        (pr.claimed_key IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM accounts a WHERE a.key = pr.claimed_key)
              OR pr.claimed_key IS NOT DISTINCT FROM pr.created_by::text)) AS by_user_id,
        EXISTS (SELECT 1 FROM accounts a WHERE a.key = pr.player_key)       AS id_is_account
    FROM participant_rows pr
),
judged AS (
    SELECT
        b.*,
        b.claimed_key IS NOT NULL AND NOT b.by_user_id AS regrouped,
        b.id_is_account AND NOT b.by_user_id           AS dropped
    FROM believed b
)
SELECT game_id, created_at, created_by, participant_id, user_id, name, regrouped, dropped
FROM judged
WHERE regrouped OR dropped
ORDER BY created_at DESC, game_id;
