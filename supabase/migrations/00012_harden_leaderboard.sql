-- ====================================
-- Killerpool Database Schema
-- Migration: 00012_harden_leaderboard
-- Description: get_leaderboard v4 — survive hostile client JSON, and pick the
--              fallback display name from the most recent game
-- ====================================
--
-- THE PROBLEM (v3, migration 00005)
--
-- games is anon-writable (00009: games_insert_anon, games_update_anon), so
-- participants/history are untrusted input. v3 casts that input to uuid in
-- three places:
--     00005:34   (participant->>'id')::uuid
--     00005:46   (participant->>'id')::uuid = g.winner_id
--     00005:70   (action->>'playerId')::uuid = pws.player_id
-- A single game with participants[0].id = "abc" aborts the whole call with
-- 22P02 invalid input syntax for type uuid — for every user, not just that
-- game. One anonymous insert switches the leaderboard off.
--
-- v3 already guards userId with a UUID regex (00005:36-41), so the hazard was
-- known; only one field got the treatment. Migration 00011 solved the same
-- class of problem for check_achievements by comparing ids as text and putting
-- a regex in front of every numeric cast.
--
-- THE FIX
--
--  * Every id comparison is text = text. Nothing from participants/history is
--    cast. winner_id::text is safe: that is a uuid COLUMN, not client JSON.
--  * Values are normalised with lower(). A uuid column always renders
--    lowercase, while a client may send uppercase — under text comparison the
--    win would otherwise be silently lost.
--  * The one ::uuid left is the output stable_key, needed for the player_id
--    UUID column in the signature, and the regex guarding it sits in the same
--    CTE. A participant with no usable identifier drops out instead of
--    aborting the calculation for everyone.
--  * jsonb_array_elements runs behind a jsonb_typeof guard, so the function
--    does not depend on the CHECK constraints from 00001 staying in place.
--  * Wins count distinct games. v3 summed a per-participant flag, so a game
--    listing the same winning participant 50 times scored 50 wins from 1 game
--    and multiplied the action totals through the join.
--  * limit_count is clamped. The RPC is callable by anon, and NULL meant "no
--    limit" while a huge value meant a full scan.
--
-- ALSO FIXED (defect in 00005:78-85)
--
-- The fallback display_name was chosen with ORDER BY game_id DESC, and game_id
-- is a random uuid_generate_v4() — so the name came from an arbitrary game
-- while the comment promised "most recent player name". It now orders by the
-- game's creation time.

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
'Returns top N players ranked by win rate and total wins. Groups by stable id (valid participants[].userId, else participants[].id). v4: no casts of client-controlled JSON (games is anon-writable) — id comparisons are text, and the single ::uuid is regex-guarded in CTE stable_rows; display_name falls back to the name from the most recent game; wins count distinct games.';

-- ====================================
-- GRANT PERMISSIONS
-- ====================================

-- CREATE OR REPLACE keeps existing grants; repeated so the migration also
-- stands on its own against a fresh database.
GRANT EXECUTE ON FUNCTION get_leaderboard(INTEGER) TO authenticated, anon;
