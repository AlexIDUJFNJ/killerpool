-- ====================================
-- RLS and integrity tests for the Killerpool schema
-- ====================================
--
-- Run against the throwaway database built by ./setup-local.sh, and nothing
-- else — this file DELETEs every game and writes into auth.users:
--
--   ./supabase/test/setup-local.sh
--   psql -h /tmp/kp-pg-sock -p 55432 -U postgres -f supabase/test/rls-policies.sql
--
-- (with PGPORT/PGSOCK overridden for setup-local.sh, pass the same values as
-- -v kp_port=... -v kp_sock=...; setup-local.sh prints the exact command.)
--
-- THE GUARD runs before the first write and refuses any database that is not
-- that one: a TCP connection, a server listening on TCP, a port or socket
-- other than expected, or a missing / foreign kp_harness.marker (written by
-- setup-local.sh, tied to the cluster's system_identifier).
--
-- EXIT STATUS. Every case states its expected outcome. A mismatch prints FAIL
-- and the summary at the end raises, so psql exits 3 (ON_ERROR_STOP); so does
-- a refused database or any statement that errors outside a case. 0 means
-- every case matched.
--
-- Policies are only meaningful under a role, so cases switch to anon /
-- authenticated and set auth.uid() the way PostgREST does. Reading the policy
-- text is not a test; this exercises it.
--
-- Three ways this harness could pass without testing anything, all checked in
-- section 0: a role with BYPASSRLS, RLS not enabled on the table (or the role
-- owning it, which exempts it), and a missing table grant — that last one
-- raises the same SQLSTATE as a policy rejection, so rls_try reports the
-- message, not just the code, and RLS cases expect the policy's message.
--
-- Outcomes as rls_try reports them:
--   ALLOWED (rows=N)   the statement ran; rows=0 on UPDATE/DELETE means RLS
--                      filtered the target row out silently
--   DENIED   <msg>     insufficient_privilege: a policy (or a grant) refused
--   ERROR <code> <msg> anything else, e.g. 23514 for a CHECK constraint

\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

-- ====================================
-- GUARD — nothing above or inside it writes; everything below does
-- ====================================

\if :{?kp_port}
\else
  \set kp_port 55432
\endif
\if :{?kp_sock}
\else
  \set kp_sock /tmp/kp-pg-sock
\endif

-- session settings, not writes: how the expected values reach the DO block
SELECT set_config('kp.expected_port', :'kp_port', false) AS port,
       set_config('kp.expected_sock', :'kp_sock', false) AS sock
\gset kp_guard_

DO $guard$
DECLARE
  v_why    text;
  v_marker record;
BEGIN
  IF inet_server_addr() IS NOT NULL THEN
    v_why := format('connected over TCP (%s:%s); the harness database is reached through its Unix socket only',
                    host(inet_server_addr()), inet_server_port());
  ELSIF current_setting('listen_addresses') <> '' THEN
    v_why := format('the server listens on TCP (listen_addresses = %L); setup-local.sh starts it with none',
                    current_setting('listen_addresses'));
  ELSIF current_setting('port') <> current_setting('kp.expected_port') THEN
    v_why := format('the server runs on port %s, expected %s',
                    current_setting('port'), current_setting('kp.expected_port'));
  ELSIF current_setting('unix_socket_directories') <> current_setting('kp.expected_sock') THEN
    v_why := format('the server socket directory is %L, expected %L',
                    current_setting('unix_socket_directories'), current_setting('kp.expected_sock'));
  ELSIF to_regclass('kp_harness.marker') IS NULL THEN
    v_why := 'no kp_harness.marker in this database, so it was not built by supabase/test/setup-local.sh';
  ELSE
    SELECT m.* INTO v_marker FROM kp_harness.marker m LIMIT 1;
    IF NOT FOUND
       OR v_marker.system_identifier IS DISTINCT FROM
          (SELECT c.system_identifier FROM pg_control_system() c) THEN
      v_why := 'kp_harness.marker was written in a different cluster';
    ELSIF v_marker.port IS DISTINCT FROM current_setting('port')
       OR v_marker.socket_dir IS DISTINCT FROM current_setting('unix_socket_directories') THEN
      v_why := 'kp_harness.marker was written for a different port or socket';
    END IF;
  END IF;

  IF v_why IS NOT NULL THEN
    RAISE EXCEPTION 'rls-policies.sql refuses to run: %', v_why
      USING HINT = 'This file deletes every game and writes into auth.users. Run it only against the database from ./supabase/test/setup-local.sh.';
  END IF;
END
$guard$;

-- ====================================
-- HELPERS (the throwaway database only — past the guard)
-- ====================================

-- Outcomes are asserted, so the "does not exist, skipping" chatter goes
SET client_min_messages = warning;

-- Run some SQL as a role with a given auth.uid(); report what happened.
CREATE OR REPLACE FUNCTION rls_try(p_role text, p_uid text, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE affected bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RESET ROLE;
    RETURN format('ALLOWED (rows=%s)', affected);
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE; RETURN 'DENIED   ' || SQLERRM;
    WHEN others THEN RESET ROLE; RETURN format('ERROR %s %s', SQLSTATE, SQLERRM);
  END;
END $$;

-- The statement PostgREST emits for supabase .upsert(mapGameToDbRow(...),
-- {onConflict:'id'}): every key of the payload is inserted AND in the SET list
-- — created_at included, which is why the server has to own it (00015).
DROP FUNCTION IF EXISTS mk_upsert(uuid, text, text, text);   -- pre-00015 shape
CREATE OR REPLACE FUNCTION mk_upsert(
  p_id           uuid,
  p_status       text,
  p_created_by   text        DEFAULT NULL,
  p_winner       text        DEFAULT NULL,
  p_participants jsonb       DEFAULT NULL,   -- NULL: Host + Guest
  p_history      jsonb       DEFAULT '[]',
  p_created_at   timestamptz DEFAULT NULL,   -- NULL: now()
  p_updated_at   timestamptz DEFAULT NULL    -- NULL: now()
) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($f$
    INSERT INTO games (id, created_at, updated_at, status, participants,
                       winner_id, ruleset_id, history, created_by,
                       current_player_index)
    VALUES (%L, %L, %L, %L, %L::jsonb, %L::uuid, NULL, %L::jsonb, %L::uuid, 0)
    ON CONFLICT (id) DO UPDATE SET
      id = EXCLUDED.id, created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at, status = EXCLUDED.status,
      participants = EXCLUDED.participants, winner_id = EXCLUDED.winner_id,
      ruleset_id = EXCLUDED.ruleset_id, history = EXCLUDED.history,
      created_by = EXCLUDED.created_by,
      current_player_index = EXCLUDED.current_player_index
  $f$,
    p_id,
    coalesce(p_created_at, now()),
    coalesce(p_updated_at, now()),
    p_status,
    coalesce(p_participants,
             '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},
               {"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]'::jsonb),
    p_winner,
    p_history,
    p_created_by);
$$;

-- n players shaped like lib/types.ts Player
CREATE OR REPLACE FUNCTION mk_players(p_n int) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_agg(jsonb_build_object(
           'id', '00000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
           'name', 'Player ' || i, 'avatar', '🎱', 'lives', 3,
           'eliminated', false, 'userId', NULL) ORDER BY i)
    FROM generate_series(1, p_n) i;
$$;

-- n history entries shaped like lib/types.ts GameHistoryEntry (~230 bytes each)
CREATE OR REPLACE FUNCTION mk_history(p_n int) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', md5('entry' || i)::uuid::text, 'action', 'pot',
           'playerId', '00000000-0000-4000-8000-000000000001',
           'playerName', 'Player 1', 'timestamp', '2026-10-16T20:15:00.000Z',
           'livesBefore', 3, 'livesAfter', 3) ORDER BY i), '[]'::jsonb)
    FROM generate_series(1, p_n) i;
$$;

-- check_achievements as a role; the granted types, comma-separated
CREATE OR REPLACE FUNCTION ach_try(p_role text, p_uid text, p_user uuid, p_game uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    SELECT coalesce(string_agg(a.achievement_type, ',' ORDER BY a.achievement_type), '(none)')
      INTO v FROM check_achievements(p_user, p_game) a;
    RESET ROLE;
    RETURN v;
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE; RETURN 'DENIED   ' || SQLERRM;
    WHEN others THEN RESET ROLE; RETURN format('ERROR %s %s', SQLSTATE, SQLERRM);
  END;
END $$;

-- The trigger makes the server clock authoritative, so an OLD row can only be
-- made by stepping around it. Fixtures only.
CREATE OR REPLACE FUNCTION age_game(p_id uuid, p_created interval, p_updated interval)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL session_replication_role = replica;
  UPDATE games SET created_at = now() - p_created, updated_at = now() - p_updated
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'age_game: no game %', p_id; END IF;
  SET LOCAL session_replication_role = origin;
END $$;

-- Results. A temp table: it lives exactly as long as this run.
CREATE TEMP TABLE kp_results (
  n        serial PRIMARY KEY,
  label    text    NOT NULL,
  expected text    NOT NULL,
  actual   text,
  ok       boolean NOT NULL
);

-- actual must START WITH expected
CREATE OR REPLACE FUNCTION expect(p_label text, p_actual text, p_expected text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_ok boolean := coalesce(starts_with(p_actual, p_expected), false);
BEGIN
  INSERT INTO kp_results (label, expected, actual, ok)
  VALUES (p_label, p_expected, p_actual, v_ok);
  RETURN format('%s  %s  ->  %s%s',
                CASE WHEN v_ok THEN 'ok  ' ELSE 'FAIL' END,
                p_label, coalesce(p_actual, 'NULL'),
                CASE WHEN v_ok THEN '' ELSE format('   [expected: %s]', p_expected) END);
END $$;

-- actual must EQUAL expected
CREATE OR REPLACE FUNCTION expect_eq(p_label text, p_actual text, p_expected text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_ok boolean := coalesce(p_actual = p_expected, false);
BEGIN
  INSERT INTO kp_results (label, expected, actual, ok)
  VALUES (p_label, '= ' || p_expected, p_actual, v_ok);
  RETURN format('%s  %s  ->  %s%s',
                CASE WHEN v_ok THEN 'ok  ' ELSE 'FAIL' END,
                p_label, coalesce(p_actual, 'NULL'),
                CASE WHEN v_ok THEN '' ELSE format('   [expected: %s]', p_expected) END);
END $$;

CREATE OR REPLACE FUNCTION expect_true(p_label text, p_cond boolean)
RETURNS text LANGUAGE sql AS $$
  SELECT expect_eq(p_label, CASE WHEN p_cond THEN 'true' WHEN NOT p_cond THEN 'false' END, 'true');
$$;

-- within a minute of now(): "the server stamped it"
CREATE OR REPLACE FUNCTION is_now(p_ts timestamptz) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_ts <= now() AND p_ts > now() - interval '1 minute';
$$;

\pset tuples_only on
\pset format unaligned

\echo
\echo '=== 0. the harness is not lying ==='
SELECT expect_true('0.1 anon and authenticated exist',
  (SELECT count(*) = 2 FROM pg_roles WHERE rolname IN ('anon', 'authenticated')));
SELECT expect_true('0.2 ...neither is superuser nor BYPASSRLS',
  NOT EXISTS (SELECT 1 FROM pg_roles
               WHERE rolname IN ('anon', 'authenticated') AND (rolsuper OR rolbypassrls)));
SELECT expect_true('0.3 RLS is on for every table under test',
  NOT EXISTS (SELECT 1 FROM pg_class
               WHERE oid IN ('games'::regclass, 'player_profiles'::regclass,
                             'rulesets'::regclass, 'user_achievements'::regclass)
                 AND NOT relrowsecurity));
SELECT expect_true('0.4 ...and no test role owns one (an owner is exempt)',
  NOT EXISTS (SELECT 1 FROM pg_class
               WHERE oid IN ('games'::regclass, 'player_profiles'::regclass,
                             'rulesets'::regclass, 'user_achievements'::regclass)
                 AND pg_get_userbyid(relowner) IN ('anon', 'authenticated')));
-- has_table_privilege with a comma list means "any of"; one call per privilege
SELECT expect_true('0.5 the test roles hold every table grant (a missing one looks like a policy rejection)',
  (SELECT bool_and(has_table_privilege(r, t, p))
     FROM unnest(ARRAY['anon', 'authenticated']) r,
          unnest(ARRAY['games', 'player_profiles', 'rulesets']) t,
          unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p));
SELECT expect('0.6 rls_try really switches role',
  rls_try('anon', NULL, 'SELECT * FROM kp_harness.marker'),
  'DENIED   permission denied for schema kp_harness');
-- the claim auth.uid() reads (setup-local.sh). Policies reach auth.uid() by
-- oid, so the test roles need no USAGE on schema auth; a statement naming it
-- would.
SELECT expect('0.7 ...and sets the claim auth.uid() reads',
  rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          $$SELECT 1 WHERE current_setting('request.jwt.claim.sub') = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$),
  'ALLOWED (rows=1)');

\echo
\echo '=== fixtures ==='
DELETE FROM games;
DELETE FROM rulesets WHERE name = 'Rogue default';
DELETE FROM auth.users WHERE id IN (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ffffffff-ffff-4fff-8fff-ffffffffffff');
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mallory@example.com'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol@example.com'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dave@example.com'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'erin@example.com'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'frank@example.com');

-- Rows with an age are planted around the timestamp trigger: through the
-- trigger, the server stamps updated_at = now() on INSERT (00015).
SET session_replication_role = replica;
INSERT INTO games (id, created_at, updated_at, status, participants, winner_id,
                   history, created_by, current_player_index) VALUES
 -- 00014 fixtures
 ('11111111-1111-4111-8111-111111111111', now(), now(), 'active',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 ('22222222-2222-4222-8222-222222222222', now(), now(), 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 ('33333333-3333-4333-8333-333333333333', now() - interval '3 days', now() - interval '3 days', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 ('44444444-4444-4444-8444-444444444444', now(), now(), 'active',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Alice"},{"id":"22222222-2222-4222-8222-000000000002","name":"Bob"}]', NULL, '[]',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0),
 ('55555555-5555-4555-8555-555555555555', now() - interval '10 days', now() - interval '10 days', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Alice"},{"id":"22222222-2222-4222-8222-000000000002","name":"Bob"}]', NULL, '[]', NULL, 0),
 -- section L: guest games of every age and state
 ('6a000000-0000-4000-8000-000000000001', now() - interval '25 hours', now() - interval '1 minute', 'active',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 ('6a000000-0000-4000-8000-000000000002', now() - interval '23 hours', now() - interval '1 minute', 'active',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 ('6a000000-0000-4000-8000-000000000003', now() - interval '3 hours', now() - interval '2 hours', 'abandoned',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 ('6a000000-0000-4000-8000-000000000004', now() - interval '30 minutes', now() - interval '10 minutes', 'abandoned',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 ('6a000000-0000-4000-8000-000000000005', now() - interval '25 hours', now() - interval '10 minutes', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]',
  '11111111-1111-4111-8111-000000000001', '[]', NULL, 0),
 ('6a000000-0000-4000-8000-000000000006', now() - interval '2 hours', now() - interval '5 minutes', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]',
  '11111111-1111-4111-8111-000000000001', '[]', NULL, 0),
 ('6a000000-0000-4000-8000-000000000007', now() - interval '2 hours', now() - interval '90 minutes', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]',
  '11111111-1111-4111-8111-000000000001', '[]', NULL, 0),
 -- section X: dave's games, about to lose their owner
 ('7d000000-0000-4000-8000-000000000001', now() - interval '3 days', now() - interval '3 days', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Dave"},{"id":"22222222-2222-4222-8222-000000000002","name":"Eve"}]',
  '11111111-1111-4111-8111-000000000001', '[]', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 0),
 ('7d000000-0000-4000-8000-000000000002', now() - interval '3 hours', now() - interval '2 hours', 'active',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Dave"},{"id":"22222222-2222-4222-8222-000000000002","name":"Eve"}]',
  NULL, '[]', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 0),
 ('7d000000-0000-4000-8000-000000000003', now() - interval '20 minutes', now() - interval '5 minutes', 'active',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Dave"},{"id":"22222222-2222-4222-8222-000000000002","name":"Eve"}]',
  NULL, '[]', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 0),
 ('7d000000-0000-4000-8000-000000000004', now() - interval '2 hours', now() - interval '2 hours', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Dave"},{"id":"22222222-2222-4222-8222-000000000002","name":"Eve"}]',
  '11111111-1111-4111-8111-000000000001', '[]', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 0);
RESET session_replication_role;
SELECT expect_eq('fixtures planted', (SELECT count(*)::text FROM games), '16');

\echo
\echo '=== A. a guest host runs a shared game ==='
SELECT expect('A1 create a game        ', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-11111111111a', 'active')), 'ALLOWED (rows=1)');
SELECT expect('A2 take a shot          ', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'active')), 'ALLOWED (rows=1)');
SELECT expect('A3 finish (active->done)', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'completed', NULL, '11111111-1111-4111-8111-000000000001')), 'ALLOWED (rows=1)');
-- A4 and A5 are the other two writes of the same completion. A bare
-- status <> 'completed' rejected these.
SELECT expect('A4 completion, 2nd write', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'completed', NULL, '11111111-1111-4111-8111-000000000001')), 'ALLOWED (rows=1)');
SELECT expect('A5 updateGameStatus     ', rls_try('anon', NULL,
        $$UPDATE games SET status='completed' WHERE id='11111111-1111-4111-8111-111111111111'$$), 'ALLOWED (rows=1)');
SELECT expect('A6 undo after the win   ', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'active')), 'ALLOWED (rows=1)');
SELECT expect('A7 play on, finish again', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'completed', NULL, '22222222-2222-4222-8222-000000000002')), 'ALLOWED (rows=1)');

\echo
\echo '=== B. the freeze (00014) ==='
SELECT expect('B1 just-finished game is writable ', rls_try('anon', NULL, mk_upsert('22222222-2222-4222-8222-222222222222', 'completed')), 'ALLOWED (rows=1)');
SELECT expect('B2 long-finished game is not      ', rls_try('anon', NULL, mk_upsert('33333333-3333-4333-8333-333333333333', 'completed')),
        'DENIED   new row violates row-level security policy (USING expression)');
SELECT expect('B3 ...a plain UPDATE is filtered  ', rls_try('anon', NULL,
        $$UPDATE games SET winner_id=NULL WHERE id='33333333-3333-4333-8333-333333333333'$$), 'ALLOWED (rows=0)');

\echo
\echo '=== C. ownership (00014) ==='
SELECT expect('C1 stranger adopts a guest game   ', rls_try('authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        mk_upsert('11111111-1111-4111-8111-111111111111', 'active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
        'DENIED   new row violates row-level security policy');
SELECT expect('C2 stranger writes to Alice''s game', rls_try('authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
        'DENIED   new row violates row-level security policy');
SELECT expect('C3 stranger creates one as Alice  ', rls_try('authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        mk_upsert('44444444-4444-4444-8444-44444444444b', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
        'DENIED   new row violates row-level security policy');
SELECT expect('C4 anon claims ownership          ', rls_try('anon', NULL,
        mk_upsert('11111111-1111-4111-8111-111111111111', 'active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
        'DENIED   new row violates row-level security policy');
SELECT expect('C5 owner disowns their own row    ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active', NULL)),
        'DENIED   new row violates row-level security policy');
SELECT expect('C6 anon deletes (filtered)        ', rls_try('anon', NULL,
        $$DELETE FROM games WHERE id='11111111-1111-4111-8111-111111111111'$$), 'ALLOWED (rows=0)');

\echo
\echo '=== D. a signed-in host ==='
SELECT expect('D1 create          ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-44444444444c', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'ALLOWED (rows=1)');
SELECT expect('D2 shot            ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'ALLOWED (rows=1)');
SELECT expect('D3 finish          ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'completed', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-000000000001')), 'ALLOWED (rows=1)');
SELECT expect('D4 duplicate finish', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'completed', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-000000000001')), 'ALLOWED (rows=1)');
SELECT expect('D5 undo, play on   ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'ALLOWED (rows=1)');

\echo
\echo '=== T. the server owns the dates (00015, part 1) ==='
SELECT expect_eq('T0 one timestamp trigger on games, the new one',
  (SELECT string_agg(tgname, ',') FROM pg_trigger WHERE tgrelid = 'games'::regclass AND NOT tgisinternal),
  'games_server_timestamps');
SELECT expect_true('T0 update_updated_at_column has a pinned search_path',
  (SELECT 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc WHERE proname = 'update_updated_at_column'));
SELECT expect('T1 anon creates a game dated 2999', rls_try('anon', NULL,
        mk_upsert('7a000000-0000-4000-8000-000000000001', 'active',
                  p_created_at => '2999-01-01', p_updated_at => '2999-01-01')), 'ALLOWED (rows=1)');
SELECT expect_true('T1 ...created_at was pulled back to now',
  (SELECT is_now(created_at) FROM games WHERE id = '7a000000-0000-4000-8000-000000000001'));
SELECT expect_true('T1 ...updated_at is the server''s, on INSERT too',
  (SELECT is_now(updated_at) FROM games WHERE id = '7a000000-0000-4000-8000-000000000001'));
SELECT created_at AS t1_created FROM games WHERE id = '7a000000-0000-4000-8000-000000000001' \gset
SELECT expect('T2 the next upsert sends created_at 2000', rls_try('anon', NULL,
        mk_upsert('7a000000-0000-4000-8000-000000000001', 'active', p_created_at => '2000-01-01')), 'ALLOWED (rows=1)');
SELECT expect_true('T2 ...created_at did not move',
  (SELECT created_at = :'t1_created'::timestamptz FROM games WHERE id = '7a000000-0000-4000-8000-000000000001'));
SELECT expect('T3 a PATCH sends updated_at 2999', rls_try('anon', NULL,
        $$UPDATE games SET status = 'active', updated_at = '2999-01-01'
           WHERE id = '7a000000-0000-4000-8000-000000000001'$$), 'ALLOWED (rows=1)');
SELECT expect_true('T3 ...updated_at is now',
  (SELECT is_now(updated_at) FROM games WHERE id = '7a000000-0000-4000-8000-000000000001'));
SELECT expect('T4 offline game uploaded 3 days after it was played', rls_try('anon', NULL,
        mk_upsert('7a000000-0000-4000-8000-000000000002', 'completed', NULL, '11111111-1111-4111-8111-000000000001',
                  p_created_at => now() - interval '3 days', p_updated_at => now() - interval '3 days')), 'ALLOWED (rows=1)');
SELECT expect_true('T4 ...keeps the date it was played',
  (SELECT created_at BETWEEN now() - interval '3 days 1 minute' AND now() - interval '2 days 23 hours 59 minutes'
     FROM games WHERE id = '7a000000-0000-4000-8000-000000000002'));
SELECT expect_true('T4 ...and is stamped as written now',
  (SELECT is_now(updated_at) FROM games WHERE id = '7a000000-0000-4000-8000-000000000002'));
SELECT created_at AS t5_created FROM games WHERE id = '44444444-4444-4444-8444-444444444444' \gset
SELECT expect('T5 Alice moves her own game to 2999', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        $$UPDATE games SET created_at = '2999-01-01' WHERE id = '44444444-4444-4444-8444-444444444444'$$), 'ALLOWED (rows=1)');
SELECT expect_true('T5 ...created_at did not move',
  (SELECT created_at = :'t5_created'::timestamptz FROM games WHERE id = '44444444-4444-4444-8444-444444444444'));

\echo
\echo '=== L. a guest game has a finite writable life (00015, part 2) ==='
SELECT expect('L1 a running guest game started 25 h ago', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000001', 'active')),
        'DENIED   new row violates row-level security policy (USING expression)');
SELECT expect('L2 ...started 23 h ago is still writable ', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000002', 'active')), 'ALLOWED (rows=1)');
SELECT expect('L3 ...a plain UPDATE of L1 is filtered   ', rls_try('anon', NULL,
        $$UPDATE games SET history = '[]' WHERE id = '6a000000-0000-4000-8000-000000000001'$$), 'ALLOWED (rows=0)');
SELECT expect('L4 abandoned 2 h ago                     ', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000003', 'active')),
        'DENIED   new row violates row-level security policy (USING expression)');
SELECT expect('L5 abandoned 10 min ago                  ', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000004', 'abandoned')), 'ALLOWED (rows=1)');
SELECT expect('L6 reopen a game finished 10 min ago, started 25 h ago (the 00014 bypass)', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000005', 'active')),
        'DENIED   new row violates row-level security policy (USING expression)');
SELECT expect('L7 undo inside the hour, game 2 h old    ', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000006', 'active')), 'ALLOWED (rows=1)');
SELECT age_game('6a000000-0000-4000-8000-000000000006', '25 hours', '1 minute') IS NULL AS aged \gset
SELECT expect('L8 ...the reopened game still dies at 24 h', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000006', 'active')),
        'DENIED   new row violates row-level security policy (USING expression)');
SELECT expect('L9 finished 90 min ago, game 2 h old     ', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000007', 'completed', NULL, '11111111-1111-4111-8111-000000000001')),
        'DENIED   new row violates row-level security policy (USING expression)');

\echo
\echo '=== R. no regressions: a game started yesterday, shared and finished today ==='
-- the client sends its own createdAt — yesterday — on every write
SELECT expect('R1 enableSharing: first upsert (INSERT)', rls_try('anon', NULL,
        mk_upsert('6b000000-0000-4000-8000-000000000001', 'active', p_created_at => now() - interval '23 hours')), 'ALLOWED (rows=1)');
SELECT expect('R2 a shot                              ', rls_try('anon', NULL,
        mk_upsert('6b000000-0000-4000-8000-000000000001', 'active', p_created_at => now() - interval '23 hours')), 'ALLOWED (rows=1)');
SELECT expect('R3 the winning shot (performAction)    ', rls_try('anon', NULL,
        mk_upsert('6b000000-0000-4000-8000-000000000001', 'completed', NULL, '11111111-1111-4111-8111-000000000001',
                  p_created_at => now() - interval '23 hours')), 'ALLOWED (rows=1)');
SELECT expect('R4 autoSyncGame                        ', rls_try('anon', NULL,
        mk_upsert('6b000000-0000-4000-8000-000000000001', 'completed', NULL, '11111111-1111-4111-8111-000000000001',
                  p_created_at => now() - interval '23 hours')), 'ALLOWED (rows=1)');
SELECT expect('R5 updateGameStatus                    ', rls_try('anon', NULL,
        $$UPDATE games SET status = 'completed', winner_id = '11111111-1111-4111-8111-000000000001',
                           updated_at = now() WHERE id = '6b000000-0000-4000-8000-000000000001'$$), 'ALLOWED (rows=1)');
SELECT expect('R6 undo the winning shot               ', rls_try('anon', NULL,
        mk_upsert('6b000000-0000-4000-8000-000000000001', 'active', p_created_at => now() - interval '23 hours')), 'ALLOWED (rows=1)');
SELECT expect('R7 replay, another winner              ', rls_try('anon', NULL,
        mk_upsert('6b000000-0000-4000-8000-000000000001', 'completed', NULL, '22222222-2222-4222-8222-000000000002',
                  p_created_at => now() - interval '23 hours')), 'ALLOWED (rows=1)');
SELECT expect_eq('R8 the replayed result is what the database holds',
  (SELECT status || ' ' || winner_id FROM games WHERE id = '6b000000-0000-4000-8000-000000000001'),
  'completed 22222222-2222-4222-8222-000000000002');
-- an offline game uploaded days late is T4 above: an INSERT, untouched by either limit

\echo
\echo '=== X. deleting an account (00015, section 3) ==='
SELECT updated_at AS x4_updated FROM games WHERE id = '7d000000-0000-4000-8000-000000000004' \gset
DELETE FROM auth.users WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT expect_eq('X1 ON DELETE SET NULL made dave''s games guest games',
  (SELECT count(*)::text FROM games WHERE id::text LIKE '7d000000-%' AND created_by IS NULL), '4');
SELECT expect_true('X2 ...without counting as a write: updated_at kept',
  (SELECT bool_and(updated_at < now() - interval '4 minutes') FROM games WHERE id::text LIKE '7d000000-%')
  AND (SELECT updated_at = :'x4_updated'::timestamptz FROM games WHERE id = '7d000000-0000-4000-8000-000000000004'));
SELECT expect_eq('X3 ...and his unfinished games were retired',
  (SELECT string_agg(status::text, ',' ORDER BY id) FROM games WHERE id::text LIKE '7d000000-%'),
  'completed,abandoned,abandoned,completed');
SELECT expect('X4 anon rewrites his 3-day-old game          ', rls_try('anon', NULL,
        mk_upsert('7d000000-0000-4000-8000-000000000001', 'completed')),
        'DENIED   new row violates row-level security policy (USING expression)');
SELECT expect('X5 ...one he finished 2 h ago (reopened for an hour before 00015)', rls_try('anon', NULL,
        mk_upsert('7d000000-0000-4000-8000-000000000004', 'completed')),
        'DENIED   new row violates row-level security policy (USING expression)');
SELECT expect('X6 ...one he left running 2 h ago (writable for good before 00015)', rls_try('anon', NULL,
        mk_upsert('7d000000-0000-4000-8000-000000000002', 'active')),
        'DENIED   new row violates row-level security policy (USING expression)');
SELECT expect('X7 residual: one he wrote to 5 min before the deletion, until its hour is up', rls_try('anon', NULL,
        mk_upsert('7d000000-0000-4000-8000-000000000003', 'active')), 'ALLOWED (rows=1)');

\echo
\echo '=== S. a game row has a size (00015, section 4) ==='
SELECT expect('S1 32 players                  ', rls_try('anon', NULL,
        mk_upsert('5a000000-0000-4000-8000-000000000001', 'active', NULL, NULL, mk_players(32))), 'ALLOWED (rows=1)');
SELECT expect('S2 33 players                  ', rls_try('anon', NULL,
        mk_upsert('5a000000-0000-4000-8000-000000000002', 'active', NULL, NULL, mk_players(33))),
        'ERROR 23514 new row for relation "games" violates check constraint "games_participants_max"');
SELECT expect('S3 1000 history entries        ', rls_try('anon', NULL,
        mk_upsert('5a000000-0000-4000-8000-000000000003', 'active', NULL, NULL, mk_players(2), mk_history(1000))), 'ALLOWED (rows=1)');
SELECT expect('S4 1001 history entries        ', rls_try('anon', NULL,
        mk_upsert('5a000000-0000-4000-8000-000000000004', 'active', NULL, NULL, mk_players(2), mk_history(1001))),
        'ERROR 23514 new row for relation "games" violates check constraint "games_history_max"');
SELECT expect('S5 ...nor by growing S3 past it', rls_try('anon', NULL,
        mk_upsert('5a000000-0000-4000-8000-000000000003', 'active', NULL, NULL, mk_players(2), mk_history(1001))),
        'ERROR 23514 new row for relation "games" violates check constraint "games_history_max"');
SELECT expect('S6 10 entries, 600 KB of names ', rls_try('anon', NULL,
        mk_upsert('5a000000-0000-4000-8000-000000000006', 'active', NULL, NULL, mk_players(2),
                  (SELECT jsonb_agg(jsonb_build_object('id', i, 'action', 'pot', 'playerName', repeat('x', 60000)))
                     FROM generate_series(1, 10) i))),
        'ERROR 23514 new row for relation "games" violates check constraint "games_payload_size"');
SELECT expect('S7 a signed-in user is bound too', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('5a000000-0000-4000-8000-000000000007', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NULL, mk_players(33))),
        'ERROR 23514 new row for relation "games" violates check constraint "games_participants_max"');

\echo
\echo '=== W. the winner is one of the players (00015, section 5) ==='
SELECT expect('W1 a winner who is not playing     ', rls_try('anon', NULL,
        mk_upsert('5b000000-0000-4000-8000-000000000001', 'completed', NULL, '99999999-9999-4999-8999-999999999999')),
        'ERROR 23514 new row for relation "games" violates check constraint "games_winner_is_participant"');
SELECT expect('W2 participant id sent in upper case', rls_try('anon', NULL,
        mk_upsert('5b000000-0000-4000-8000-000000000002', 'completed', NULL, 'abcdef00-0000-4000-8000-0000000000aa',
                  '[{"id":"ABCDEF00-0000-4000-8000-0000000000AA","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]')),
        'ALLOWED (rows=1)');
SELECT expect('W3 updateGameStatus names a stranger', rls_try('anon', NULL,
        $$UPDATE games SET status = 'completed', winner_id = '99999999-9999-4999-8999-999999999999'
           WHERE id = '6a000000-0000-4000-8000-000000000002'$$),
        'ERROR 23514 new row for relation "games" violates check constraint "games_winner_is_participant"');
SELECT expect('W4 completed without a winner       ', rls_try('anon', NULL,
        mk_upsert('5b000000-0000-4000-8000-000000000004', 'completed')), 'ALLOWED (rows=1)');

\echo
\echo '=== P. profiles and rulesets (00015, section 6) ==='
SELECT expect('P1 anon creates a profile, user_id NULL', rls_try('anon', NULL,
        $$INSERT INTO player_profiles (user_id, display_name) VALUES (NULL, 'spam')$$),
        'DENIED   new row violates row-level security policy');
SELECT expect('P2 anon creates Alice''s profile        ', rls_try('anon', NULL,
        $$INSERT INTO player_profiles (user_id, display_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'spam')$$),
        'DENIED   new row violates row-level security policy');
SELECT expect('P3 Alice creates one with user_id NULL ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        $$INSERT INTO player_profiles (user_id, display_name) VALUES (NULL, 'spam')$$),
        'DENIED   new row violates row-level security policy');
SELECT expect('P4 Alice creates Mallory''s             ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        $$INSERT INTO player_profiles (user_id, display_name) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spam')$$),
        'DENIED   new row violates row-level security policy');
-- lib/sync.ts ensurePlayerProfile: upsert(..., {onConflict:'user_id', ignoreDuplicates:true})
SELECT expect('P5 ensurePlayerProfile                 ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        $$INSERT INTO player_profiles (user_id, display_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice')
          ON CONFLICT (user_id) DO NOTHING$$), 'ALLOWED (rows=1)');
SELECT expect('P6 ...again                            ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        $$INSERT INTO player_profiles (user_id, display_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice')
          ON CONFLICT (user_id) DO NOTHING$$), 'ALLOWED (rows=0)');
-- app/profile/page.tsx: upsert({user_id, display_name}, {onConflict:'user_id'})
SELECT expect('P7 the profile page saves a name       ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        $$INSERT INTO player_profiles (user_id, display_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alice B.')
          ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, display_name = EXCLUDED.display_name$$),
        'ALLOWED (rows=1)');
SELECT expect_eq('P8 ...and it stuck',
  (SELECT display_name FROM player_profiles WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Alice B.');
SELECT expect('P9 anon creates a ruleset              ', rls_try('anon', NULL,
        $$INSERT INTO rulesets (name, params) VALUES ('spam', '{"starting_lives":3,"miss":-1,"pot":0,"pot_black":1}')$$),
        'DENIED   new row violates row-level security policy');
SELECT expect('P10 Alice creates a ruleset            ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        $$INSERT INTO rulesets (name, params) VALUES ('spam', '{"starting_lives":3,"miss":-1,"pot":0,"pot_black":1}')$$),
        'DENIED   new row violates row-level security policy');
SELECT expect('P11 not even the owner adds a 2nd default', rls_try('postgres', NULL,
        $$INSERT INTO rulesets (name, params, is_default) VALUES ('second', '{"starting_lives":3,"miss":-1,"pot":0,"pot_black":1}', true)$$),
        'ERROR 23505');
SELECT expect('P12 everyone still reads the default   ', rls_try('anon', NULL,
        $$SELECT 1 FROM rulesets WHERE is_default$$), 'ALLOWED (rows=1)');

\echo
\echo '=== K. perfect_game needs a shot (00015, section 7) ==='
SELECT expect('K0 anon cannot call check_achievements',
  ach_try('anon', NULL, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '6c000000-0000-4000-8000-000000000001'),
  'DENIED   permission denied for function check_achievements');
SELECT expect('K-setup carol wins without a shot      ', rls_try('authenticated', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        mk_upsert('6c000000-0000-4000-8000-000000000001', 'completed', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  'c0000000-0000-4000-8000-000000000001',
                  '[{"id":"c0000000-0000-4000-8000-000000000001","name":"Carol","lives":3,"eliminated":false,"userId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},
                    {"id":"c0000000-0000-4000-8000-000000000002","name":"Opp","lives":0,"eliminated":true,"userId":null}]',
                  '[]', p_created_at => now() - interval '3 hours')), 'ALLOWED (rows=1)');
SELECT expect_eq('K1 ...first_win, and no perfect_game for an empty history',
  ach_try('authenticated', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '6c000000-0000-4000-8000-000000000001'),
  'first_win');
SELECT expect_eq('K2 Mallory asks on Carol''s behalf',
  ach_try('authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '6c000000-0000-4000-8000-000000000001'),
  '(none)');
SELECT expect('K-setup carol wins, only Opp ever shot   ', rls_try('authenticated', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        mk_upsert('6c000000-0000-4000-8000-000000000002', 'completed', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  'c0000000-0000-4000-8000-000000000001',
                  '[{"id":"c0000000-0000-4000-8000-000000000001","name":"Carol","lives":3,"eliminated":false,"userId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},
                    {"id":"c0000000-0000-4000-8000-000000000002","name":"Opp","lives":0,"eliminated":true,"userId":null}]',
                  '[{"id":"h1","action":"miss","playerId":"c0000000-0000-4000-8000-000000000002","livesBefore":3,"livesAfter":2},
                    {"id":"h2","action":"miss","playerId":"c0000000-0000-4000-8000-000000000002","livesBefore":2,"livesAfter":1},
                    {"id":"h3","action":"miss","playerId":"c0000000-0000-4000-8000-000000000002","livesBefore":1,"livesAfter":0}]',
                  p_created_at => now() - interval '2 hours')), 'ALLOWED (rows=1)');
SELECT expect_eq('K3 ...still no perfect_game',
  ach_try('authenticated', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '6c000000-0000-4000-8000-000000000002'),
  '(none)');
SELECT expect('K-setup carol wins, shot, lost nothing   ', rls_try('authenticated', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        mk_upsert('6c000000-0000-4000-8000-000000000003', 'completed', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  'c0000000-0000-4000-8000-000000000001',
                  '[{"id":"c0000000-0000-4000-8000-000000000001","name":"Carol","lives":3,"eliminated":false,"userId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},
                    {"id":"c0000000-0000-4000-8000-000000000002","name":"Opp","lives":0,"eliminated":true,"userId":null}]',
                  '[{"id":"h1","action":"pot","playerId":"c0000000-0000-4000-8000-000000000001","livesBefore":3,"livesAfter":3},
                    {"id":"h2","action":"miss","playerId":"c0000000-0000-4000-8000-000000000002","livesBefore":3,"livesAfter":2},
                    {"id":"h3","action":"miss","playerId":"c0000000-0000-4000-8000-000000000002","livesBefore":2,"livesAfter":1},
                    {"id":"h4","action":"miss","playerId":"c0000000-0000-4000-8000-000000000002","livesBefore":1,"livesAfter":0}]',
                  p_created_at => now() - interval '1 hour')), 'ALLOWED (rows=1)');
-- third straight win, hence the streak
SELECT expect_eq('K4 ...perfect_game (and the streak)',
  ach_try('authenticated', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '6c000000-0000-4000-8000-000000000003'),
  'perfect_game,win_streak_3');

\echo
\echo '=== G. a registered identity counts only in its own games (00015, section 8) ==='
-- Erin is signed in on her phone: her host participant carries her uid, her
-- games carry created_by = her uid (rowOwner in lib/sync.ts). Her participant
-- ids are as public as every game row.
\set erin_players '[{"id":"e0000000-0000-4000-8000-000000000001","name":"Erin","userId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"},{"id":"e0000000-0000-4000-8000-000000000002","name":"Opp","userId":null}]'
SELECT expect('G-setup Erin''s profile (ensurePlayerProfile)', rls_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        $$INSERT INTO player_profiles (user_id, display_name) VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Erin')
          ON CONFLICT (user_id) DO NOTHING$$), 'ALLOWED (rows=1)');
SELECT expect('G-setup Erin wins honestly, 5 h ago', rls_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        mk_upsert('6e000000-0000-4000-8000-000000000001', 'completed', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  'e0000000-0000-4000-8000-000000000001', :'erin_players', '[]', now() - interval '5 hours')), 'ALLOWED (rows=1)');
SELECT expect('G-setup ...4 h ago', rls_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        mk_upsert('6e000000-0000-4000-8000-000000000002', 'completed', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  'e0000000-0000-4000-8000-000000000001', :'erin_players', '[]', now() - interval '4 hours')), 'ALLOWED (rows=1)');
SELECT expect('G-setup ...3 h ago', rls_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        mk_upsert('6e000000-0000-4000-8000-000000000003', 'completed', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  'e0000000-0000-4000-8000-000000000001', :'erin_players', '[]', now() - interval '3 hours')), 'ALLOWED (rows=1)');
SELECT expect('G-setup ...2 h ago', rls_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        mk_upsert('6e000000-0000-4000-8000-000000000004', 'completed', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  'e0000000-0000-4000-8000-000000000001', :'erin_players', '[]', now() - interval '2 hours')), 'ALLOWED (rows=1)');
SELECT expect_eq('G1 her honest games count: four wins, streak of four',
  ach_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '6e000000-0000-4000-8000-000000000004'),
  'first_win,win_streak_3');
-- The forgeries. Writing them is allowed (anon INSERT has to stay open, 00014);
-- what is tested is that they count for nothing. All dated now: the newest.
SELECT expect('G-forge anon: a loss naming Erin            ', rls_try('anon', NULL,
        mk_upsert('6f000000-0000-4000-8000-000000000001', 'completed', NULL,
                  'e0000000-0000-4000-8000-000000000002', :'erin_players')), 'ALLOWED (rows=1)');
-- five black pots and no life lost: pot_black_master and perfect_game, if it
-- counted for her
SELECT expect('G-forge anon: a win naming Erin             ', rls_try('anon', NULL,
        mk_upsert('6f000000-0000-4000-8000-000000000002', 'completed', NULL,
                  'e0000000-0000-4000-8000-000000000001', :'erin_players',
                  (SELECT jsonb_agg(jsonb_build_object('id', 'b' || i, 'action', 'pot_black',
                                                       'playerId', 'e0000000-0000-4000-8000-000000000001',
                                                       'livesBefore', 3, 'livesAfter', 3))
                     FROM generate_series(1, 5) i))), 'ALLOWED (rows=1)');
SELECT expect('G-forge Mallory: a loss naming Erin, own row', rls_try('authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        mk_upsert('6f000000-0000-4000-8000-000000000003', 'completed', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  'e0000000-0000-4000-8000-000000000002', :'erin_players')), 'ALLOWED (rows=1)');
SELECT expect('G-forge anon: Erin''s uid as a participant id', rls_try('anon', NULL,
        mk_upsert('6f000000-0000-4000-8000-000000000004', 'completed', NULL, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  '[{"id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","name":"Erin, fake"},{"id":"e0000000-0000-4000-8000-000000000002","name":"Opp"}]')),
        'ALLOWED (rows=1)');
SELECT expect('G-setup Erin wins honestly, 1 h ago', rls_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        mk_upsert('6e000000-0000-4000-8000-000000000005', 'completed', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  'e0000000-0000-4000-8000-000000000001', :'erin_players', '[]', now() - interval '1 hour')), 'ALLOWED (rows=1)');
SELECT expect_eq('G2 the planted losses did not end her streak (5 straight)',
  ach_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '6e000000-0000-4000-8000-000000000005'),
  'win_streak_5');
SELECT expect_eq('G3 a forged win naming her earns her nothing',
  ach_try('authenticated', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '6f000000-0000-4000-8000-000000000002'),
  '(none)');
SELECT expect_eq('G4 her leaderboard row: her name, her 5 games, 5 wins',
  (SELECT display_name || ' ' || total_games || '/' || games_won
     FROM get_leaderboard(100, 1) WHERE player_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'Erin 5/5');
SELECT expect_eq('G5 no other row carries her uid (the participant-id trick is dropped)',
  (SELECT count(*)::text FROM get_leaderboard(100, 1) WHERE player_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), '1');
SELECT expect_eq('G6 the forged games land on a guest row of their own',
  (SELECT display_name || ' ' || total_games || '/' || games_won
     FROM get_leaderboard(100, 1) WHERE player_id = 'e0000000-0000-4000-8000-000000000001'),
  'Erin 3/1');

-- Frank played as a guest on this device, then signed in. The game he
-- finishes first after signing in is adopted on its INSERT: created_by = his
-- uid, while his host participant still carries the device guest id.
\set frank_guest_players '[{"id":"f0000000-0000-4000-8000-000000000001","name":"Frank","userId":"f9999999-9999-4999-8999-999999999999"},{"id":"f0000000-0000-4000-8000-000000000002","name":"Pal","userId":null}]'
\set frank_players '[{"id":"f0000000-0000-4000-8000-000000000001","name":"Frank","userId":"ffffffff-ffff-4fff-8fff-ffffffffffff"},{"id":"f0000000-0000-4000-8000-000000000002","name":"Pal","userId":null}]'
SELECT expect('G-setup Frank''s guest game, synced as a guest', rls_try('anon', NULL,
        mk_upsert('6d000000-0000-4000-8000-000000000001', 'completed', NULL,
                  'f0000000-0000-4000-8000-000000000001', :'frank_guest_players', '[]', now() - interval '3 hours')), 'ALLOWED (rows=1)');
SELECT expect('G-setup Frank''s profile (ensurePlayerProfile)', rls_try('authenticated', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        $$INSERT INTO player_profiles (user_id, display_name) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Frank')
          ON CONFLICT (user_id) DO NOTHING$$), 'ALLOWED (rows=1)');
SELECT expect('G7 a guest game adopted at its first INSERT after sign-in', rls_try('authenticated', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        mk_upsert('6d000000-0000-4000-8000-000000000002', 'completed', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                  'f0000000-0000-4000-8000-000000000001', :'frank_guest_players', '[]', now() - interval '2 hours')), 'ALLOWED (rows=1)');
SELECT expect('G-setup Frank''s first game as himself     ', rls_try('authenticated', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        mk_upsert('6d000000-0000-4000-8000-000000000003', 'completed', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                  'f0000000-0000-4000-8000-000000000001', :'frank_players', '[]', now() - interval '1 hour')), 'ALLOWED (rows=1)');
-- the guest id is no account (in neither player_profiles nor created_by), so
-- it keeps grouping him, as in 00013
SELECT expect_eq('G8 ...it still counts as a guest game, with his other one, under the device guest id',
  (SELECT display_name || ' ' || total_games || '/' || games_won
     FROM get_leaderboard(100, 1) WHERE player_id = 'f9999999-9999-4999-8999-999999999999'),
  'Frank 2/2');
SELECT expect_eq('G9 ...not split off under his participant id',
  (SELECT count(*)::text FROM get_leaderboard(100, 1) WHERE player_id = 'f0000000-0000-4000-8000-000000000001'), '0');
SELECT expect_eq('G10 his account has exactly the game he played signed in',
  (SELECT display_name || ' ' || total_games || '/' || games_won
     FROM get_leaderboard(100, 1) WHERE player_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  'Frank 1/1');
SELECT expect_eq('G11 the adopted game grants him nothing (host userId is the guest id)',
  ach_try('authenticated', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '6d000000-0000-4000-8000-000000000002'),
  '(none)');
SELECT expect_eq('G12 ...his signed-in game does',
  ach_try('authenticated', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '6d000000-0000-4000-8000-000000000003'),
  'first_win');

-- Gina is a guest host from before the device roster: one guest id, but every
-- game minted fresh participant ids. The guest id is what adds her games up.
SELECT expect('G-setup Gina''s guest game, participant id #1', rls_try('anon', NULL,
        mk_upsert('6d000000-0000-4000-8000-000000000011', 'completed', NULL, 'ab000000-0000-4000-8000-000000000001',
                  '[{"id":"ab000000-0000-4000-8000-000000000001","name":"Gina","userId":"abababab-abab-4bab-8bab-abababababab"},{"id":"ab000000-0000-4000-8000-000000000002","name":"Pal"}]',
                  '[]', now() - interval '20 hours')), 'ALLOWED (rows=1)');
SELECT expect('G-setup Gina''s guest game, participant id #2', rls_try('anon', NULL,
        mk_upsert('6d000000-0000-4000-8000-000000000012', 'completed', NULL, 'ab000000-0000-4000-8000-000000000012',
                  '[{"id":"ab000000-0000-4000-8000-000000000011","name":"Gina","userId":"abababab-abab-4bab-8bab-abababababab"},{"id":"ab000000-0000-4000-8000-000000000012","name":"Pal"}]',
                  '[]', now() - interval '10 hours')), 'ALLOWED (rows=1)');
SELECT expect_eq('G18 a guest host with one guest id and two participant ids is one row',
  (SELECT display_name || ' ' || total_games || '/' || games_won
     FROM get_leaderboard(100, 1) WHERE player_id = 'abababab-abab-4bab-8bab-abababababab'),
  'Gina 2/1');
SELECT expect_eq('G19 ...with no stray rows under either participant id',
  (SELECT count(*)::text FROM get_leaderboard(100, 1)
    WHERE player_id IN ('ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000011')), '0');

-- the RPC's contract is unchanged
SELECT expect_eq('G13 get_leaderboard keeps its signature',
  pg_get_function_identity_arguments('get_leaderboard'::regproc), 'limit_count integer, min_games integer');
SELECT expect_true('G14 ...SECURITY DEFINER with a pinned search_path',
  (SELECT prosecdef AND 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc WHERE oid = 'get_leaderboard'::regproc));
SELECT expect('G15 ...callable by anon', rls_try('anon', NULL, 'SELECT * FROM get_leaderboard(15)'), 'ALLOWED (rows=');
SELECT expect_true('G16 ...min_games still defaults to 3: Erin (5) in, Frank''s guest row (2) out',
  EXISTS (SELECT 1 FROM get_leaderboard(100) WHERE player_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  AND NOT EXISTS (SELECT 1 FROM get_leaderboard(100) WHERE player_id = 'f9999999-9999-4999-8999-999999999999'));
SELECT expect_eq('G17 ...and limit_count is still clamped to 0..100',
  (SELECT count(*)::text FROM get_leaderboard(-5, 1)), '0');

\echo
\echo '=== E. accepted regressions — refused here, handled or tolerated in the client ==='
SELECT expect('E1 /sync adopts a pre-login guest game (00014)', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('55555555-5555-4555-8555-555555555555', 'completed', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
        'DENIED   new row violates row-level security policy (USING expression)');
-- T4's game was played 3 days ago and uploaded seconds ago. Its first write
-- landed; a second one (a retry whose response got lost, /sync) is past the
-- life limit, which counts from the date the client gave the game. 00014
-- refused it too: its hour counted from the client's updated_at, three days
-- old as well.
SELECT expect('E2 anon re-sends an offline game uploaded late', rls_try('anon', NULL,
        mk_upsert('7a000000-0000-4000-8000-000000000002', 'completed', NULL, '11111111-1111-4111-8111-000000000001',
                  p_created_at => now() - interval '3 days')),
        'DENIED   new row violates row-level security policy (USING expression)');

\echo
\echo '=== F. the Postgres behaviour these policies rely on ==='
BEGIN;
  DROP POLICY IF EXISTS "games_insert_anon" ON games;
  CREATE POLICY "games_insert_anon" ON games FOR INSERT TO anon
    WITH CHECK (created_by IS NULL AND status = 'active');   -- the trap
  SELECT rls_try('anon', NULL, mk_upsert('22222222-2222-4222-8222-222222222222', 'completed')) AS f1 \gset
ROLLBACK;
SELECT expect('F1 an INSERT WITH CHECK also gates DO UPDATE', :'f1',
        'DENIED   new row violates row-level security policy for table "games"');
SELECT expect('F2 a plain UPDATE failing USING is silent   ', rls_try('anon', NULL,
        $$UPDATE games SET status='abandoned' WHERE id='44444444-4444-4444-8444-444444444444'$$), 'ALLOWED (rows=0)');
SELECT expect('F3 ...an upsert of the same row raises      ', rls_try('anon', NULL,
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active')),
        'DENIED   new row violates row-level security policy (USING expression)');

\echo
\echo '=== M. 00015 again, on a database that needs it ==='
-- Legacy rows the data fix and NOT VALID exist for, planted the only way they
-- still can be: around the trigger, and with the constraint out of the way.
ALTER TABLE games DROP CONSTRAINT games_winner_is_participant;
SET session_replication_role = replica;
INSERT INTO games (id, created_at, updated_at, status, participants, winner_id,
                   history, created_by, current_player_index) VALUES
 -- dated into the future at INSERT, never updated
 ('5f000000-0000-4000-8000-000000000001', now() + interval '1000 years', now() + interval '1000 years', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 -- created_at in the future, last written yesterday by the server
 ('5f000000-0000-4000-8000-000000000002', now() + interval '1000 years', now() - interval '1 day', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]', NULL, '[]', NULL, 0),
 -- a winner who never played
 ('5f000000-0000-4000-8000-000000000003', now() - interval '5 days', now() - interval '5 days', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]',
  '99999999-9999-4999-8999-999999999999', '[]', NULL, 0);
RESET session_replication_role;
-- a second default, older than the seed, as the dropped INSERT policy allowed
DROP INDEX idx_rulesets_one_default;
INSERT INTO rulesets (name, params, is_default, created_at)
VALUES ('Rogue default', '{"starting_lives":3,"miss":-1,"pot":0,"pot_black":1}', true, '2000-01-01');
SELECT updated_at AS m_untouched FROM games WHERE id = '33333333-3333-4333-8333-333333333333' \gset

-- client_min_messages is still 'warning': the NOTICE that matters (a
-- constraint left NOT VALID) is asserted below instead
\ir ../migrations/00015_game_integrity_and_spam_limits.sql

SELECT expect_true('M1 the re-run went through; the violated constraint is back NOT VALID',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'games'::regclass
           AND conname = 'games_winner_is_participant' AND NOT convalidated));
SELECT expect_true('M2 ...the other three validated',
  (SELECT count(*) = 3 AND bool_and(convalidated) FROM pg_constraint WHERE conrelid = 'games'::regclass
      AND conname IN ('games_participants_max', 'games_history_max', 'games_payload_size')));
SELECT expect_true('M3 ...the offending row left alone',
  EXISTS (SELECT 1 FROM games WHERE id = '5f000000-0000-4000-8000-000000000003'
             AND winner_id = '99999999-9999-4999-8999-999999999999'));
SELECT expect('M4 ...and NOT VALID still checks new writes', rls_try('anon', NULL,
        mk_upsert('6a000000-0000-4000-8000-000000000002', 'completed', NULL, '99999999-9999-4999-8999-999999999999')),
        'ERROR 23514 new row for relation "games" violates check constraint "games_winner_is_participant"');
SELECT expect_true('M5 a row dated 3026 is now',
  (SELECT is_now(created_at) AND is_now(updated_at) FROM games WHERE id = '5f000000-0000-4000-8000-000000000001'));
SELECT expect_true('M6 a future created_at falls back to the last write',
  (SELECT created_at = updated_at AND updated_at < now() - interval '23 hours'
     FROM games WHERE id = '5f000000-0000-4000-8000-000000000002'));
SELECT expect_true('M7 a row with sane dates was not touched',
  (SELECT updated_at = :'m_untouched'::timestamptz FROM games WHERE id = '33333333-3333-4333-8333-333333333333'));
SELECT expect_eq('M8 one default ruleset, the classic one',
  (SELECT string_agg(name, ',') FROM rulesets WHERE is_default), 'Classic Killer Pool');
SELECT expect_true('M9 ...the rogue one demoted, not deleted',
  EXISTS (SELECT 1 FROM rulesets WHERE name = 'Rogue default' AND NOT is_default));
DELETE FROM games WHERE id = '5f000000-0000-4000-8000-000000000003';
\ir ../migrations/00015_game_integrity_and_spam_limits.sql
SELECT expect_true('M10 once the row is gone, the next run validates all four',
  (SELECT count(*) = 4 AND bool_and(convalidated) FROM pg_constraint WHERE conrelid = 'games'::regclass
      AND conname IN ('games_participants_max', 'games_history_max', 'games_payload_size',
                      'games_winner_is_participant')));
SELECT expect('M11 and the host flow still works after three runs', rls_try('anon', NULL,
        mk_upsert('11111111-1111-4111-8111-11111111111b', 'active')), 'ALLOWED (rows=1)');

\pset tuples_only off
\pset format aligned
\echo
\echo '=== final policy set ==='
SELECT tablename, policyname, cmd, roles::text, qual, with_check
  FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd, policyname;
\echo '=== games constraints ==='
SELECT conname, convalidated, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint WHERE conrelid = 'games'::regclass AND contype = 'c' ORDER BY conname;

\pset tuples_only on
\pset format unaligned
\echo
SELECT format('=== %s checks: %s passed, %s failed ===',
              count(*), count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok))
  FROM kp_results;
SELECT format('FAILED  %s  ->  %s   [expected: %s]', label, coalesce(actual, 'NULL'), expected)
  FROM kp_results WHERE NOT ok ORDER BY n;
DO $$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM kp_results WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'rls-policies.sql: % check(s) failed', v_failed;
  END IF;
END $$;
