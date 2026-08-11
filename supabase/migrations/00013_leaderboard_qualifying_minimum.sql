-- ====================================
-- Killerpool Database Schema
-- Migration: 00013_leaderboard_qualifying_minimum
-- Description: get_leaderboard v5 — a player has to have played a few games
--              before being ranked
-- ====================================
--
-- THE PROBLEM
--
-- v4 ranks by win_rate first (00012:189-195) with no floor on games played, so
-- somebody who played once and won stands at 100% above a player who won forty
-- out of sixty. Until now that was masked by a worse bug — every opponent got a
-- fresh id each game, so nobody accumulated games at all. With the device
-- roster giving people a stable id, the table finally aggregates, and this
-- becomes the thing standing between it and a meaningful ranking.
--
-- THE FIX
--
-- The standard answer from sports tables: a qualifying minimum. min_games
-- (default 3) keeps win_rate as the ranking metric — "who plays better", not
-- "who plays most" — while one-off hundred-percenters wait their turn.
--
-- Ranking by wins instead was considered and rejected: whoever owns the phone
-- is in nearly every game, so they would top the table by volume rather than
-- by play.
--
-- WHY DROP AND RECREATE
--
-- Postgres identifies a function by name plus argument types, so adding a
-- parameter would create a second get_leaderboard(integer, integer) beside the
-- old get_leaderboard(integer) — and a one-argument call would keep hitting the
-- old one. The old signature has to go, which also drops its grants; they are
-- reissued at the bottom.
--
-- Everything else is v4 verbatim: no casts of client-controlled JSON, the one
-- ::uuid regex-guarded in stable_rows, wins counted per distinct game, the
-- fallback display name from the player's most recent game.

DROP FUNCTION IF EXISTS get_leaderboard(INTEGER);

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
    WITH participant_rows AS (
        -- One row per (completed game x participant). No casts of client JSON.
        SELECT
            g.id                                    AS game_id,
            g.created_at                            AS game_created_at,
            lower(g.winner_id::text)                AS winner_key,
            lower(participant->>'id')               AS player_key,
            nullif(btrim(participant->>'name'), '') AS player_name,
            CASE
                WHEN participant->>'userId' ~*
                     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN lower(participant->>'userId')
            END                                     AS user_key
        FROM games g
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(g.participants) = 'array'
                 THEN g.participants
                 ELSE '[]'::jsonb END
        ) AS participant
        WHERE g.status = 'completed'
    ),
    stable_rows AS (
        -- Grouping key: a valid userId, else the per-game participant id
        -- (same semantics as 00005:53-59)
        SELECT *
        FROM (
            SELECT
                pr.*,
                COALESCE(pr.user_key, pr.player_key) AS stable_key
            FROM participant_rows pr
        ) s
        -- Guard for the single ::uuid below. A participant with a junk id and
        -- no userId cannot be represented in the player_id UUID column anyway,
        -- so it drops out rather than aborting the whole call.
        WHERE s.stable_key ~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
            -- Name from the player's most recent game (fixes 00005:78-85,
            -- which sorted by a random game_id)
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
    -- The profile joins on stable_id directly: when userId is valid it is the
    -- stable key by construction, and a per-game participant id is a random
    -- uuid that cannot collide with auth.users.id. player_profiles.user_id is
    -- UNIQUE (00003/00004), so this cannot multiply rows.
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

-- ====================================
-- COMMENTS
-- ====================================

COMMENT ON FUNCTION get_leaderboard IS
'Returns top N players ranked by win rate, among those who have played at least min_games (default 3). Groups by stable id (valid participants[].userId, else participants[].id). No casts of client-controlled JSON — games is anon-writable — and the single ::uuid is regex-guarded in CTE stable_rows.';

-- ====================================
-- GRANT PERMISSIONS
-- ====================================

-- DROP FUNCTION removed the old grants along with the old signature.
GRANT EXECUTE ON FUNCTION get_leaderboard(INTEGER, INTEGER) TO authenticated, anon;
