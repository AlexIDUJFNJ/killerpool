-- ====================================
-- RLS policy tests for `games`
-- ====================================
--
-- Run against a database built by ./setup-local.sh:
--   psql -h /tmp/kp-pg-sock -p 55432 -U postgres -f supabase/test/rls-policies.sql
--
-- Policies are only meaningful under a role, so these switch to anon /
-- authenticated and set auth.uid() the way PostgREST does. Reading the policy
-- text is not a test; this exercises it.
--
-- Three ways this harness could pass without testing anything, all checked in
-- section 0: a role with BYPASSRLS, RLS not enabled on the table (or the role
-- owning it, which exempts it), and a missing table grant — that last one
-- raises the same SQLSTATE as a policy rejection, so rls_try reports the
-- message, not just the code.

\set QUIET on
\pset pager off

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

-- The exact statement PostgREST emits for supabase .upsert({onConflict:'id'})
CREATE OR REPLACE FUNCTION mk_upsert(
  p_id uuid,
  p_status text,
  p_created_by text DEFAULT NULL,
  p_winner text DEFAULT NULL
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format($f$
    INSERT INTO games (id, created_at, updated_at, status, participants,
                       winner_id, ruleset_id, history, created_by,
                       current_player_index)
    VALUES (%L, now(), now(), %L,
            '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},
              {"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]'::jsonb,
            %L::uuid, NULL, '[]'::jsonb, %L::uuid, 0)
    ON CONFLICT (id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at, status = EXCLUDED.status,
      participants = EXCLUDED.participants, winner_id = EXCLUDED.winner_id,
      history = EXCLUDED.history, created_by = EXCLUDED.created_by,
      current_player_index = EXCLUDED.current_player_index
  $f$, p_id, p_status, p_winner, p_created_by);
$$;

\set QUIET off
\echo
\echo '=== 0. the harness is not lying ==='
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
 WHERE rolname IN ('anon', 'authenticated');
SELECT relrowsecurity AS rls_on, pg_get_userbyid(relowner) AS owner
  FROM pg_class WHERE oid = 'public.games'::regclass;

\echo
\echo '=== fixtures ==='
DELETE FROM games;
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mallory@example.com')
ON CONFLICT DO NOTHING;

-- G3 is inserted already old: an UPDATE could not age it, the updated_at
-- trigger would overwrite the value.
INSERT INTO games (id, created_at, updated_at, status, participants, winner_id,
                   history, created_by, current_player_index) VALUES
 ('11111111-1111-4111-8111-111111111111', now(), now(), 'active',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]'::jsonb, NULL, '[]'::jsonb, NULL, 0),
 ('22222222-2222-4222-8222-222222222222', now(), now(), 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]'::jsonb, NULL, '[]'::jsonb, NULL, 0),
 ('33333333-3333-4333-8333-333333333333', now() - interval '3 days',
  now() - interval '3 days', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Host"},{"id":"22222222-2222-4222-8222-000000000002","name":"Guest"}]'::jsonb, NULL, '[]'::jsonb, NULL, 0),
 ('44444444-4444-4444-8444-444444444444', now(), now(), 'active',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Alice"},{"id":"22222222-2222-4222-8222-000000000002","name":"Bob"}]'::jsonb, NULL, '[]'::jsonb,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0),
 ('55555555-5555-4555-8555-555555555555', now() - interval '10 days',
  now() - interval '10 days', 'completed',
  '[{"id":"11111111-1111-4111-8111-000000000001","name":"Alice"},{"id":"22222222-2222-4222-8222-000000000002","name":"Bob"}]'::jsonb, NULL, '[]'::jsonb, NULL, 0);

\echo
\echo '=== A. a guest host runs a shared game — every line must be ALLOWED ==='
SELECT 'A1 create a game        ' AS case, rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-11111111111a', 'active'));
SELECT 'A2 take a shot          ', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'active'));
SELECT 'A3 finish (active->done)', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'completed', NULL, '11111111-1111-4111-8111-000000000001'));
-- A4 and A5 are the other two writes of the same completion. A bare
-- status <> 'completed' rejected these.
SELECT 'A4 completion, 2nd write', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'completed', NULL, '11111111-1111-4111-8111-000000000001'));
SELECT 'A5 updateGameStatus     ', rls_try('anon', NULL,
        $$UPDATE games SET status='completed' WHERE id='11111111-1111-4111-8111-111111111111'$$);
SELECT 'A6 undo after the win   ', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'active'));
SELECT 'A7 play on, finish again', rls_try('anon', NULL, mk_upsert('11111111-1111-4111-8111-111111111111', 'completed', NULL, '22222222-2222-4222-8222-000000000002'));

\echo
\echo '=== B. the freeze ==='
SELECT 'B1 just-finished game is writable ' AS case, rls_try('anon', NULL, mk_upsert('22222222-2222-4222-8222-222222222222', 'completed'));
SELECT 'B2 long-finished game is not      ', rls_try('anon', NULL, mk_upsert('33333333-3333-4333-8333-333333333333', 'completed'));
SELECT 'B3 ...also via a plain UPDATE     ', rls_try('anon', NULL,
        $$UPDATE games SET winner_id=NULL WHERE id='33333333-3333-4333-8333-333333333333'$$);

\echo
\echo '=== C. what this migration is for ==='
SELECT 'C1 stranger adopts a guest game   ' AS case, rls_try('authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        mk_upsert('11111111-1111-4111-8111-111111111111', 'active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
SELECT 'C2 stranger writes to Alice''s game', rls_try('authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
SELECT 'C3 stranger creates one as Alice  ', rls_try('authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        mk_upsert('44444444-4444-4444-8444-44444444444b', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
SELECT 'C4 anon claims ownership          ', rls_try('anon', NULL,
        mk_upsert('11111111-1111-4111-8111-111111111111', 'active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
SELECT 'C5 owner disowns their own row    ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active', NULL));
SELECT 'C6 anon deletes                   ', rls_try('anon', NULL,
        $$DELETE FROM games WHERE id='11111111-1111-4111-8111-111111111111'$$);

\echo
\echo '=== D. a signed-in host — every line must be ALLOWED ==='
SELECT 'D1 create  ' AS case, rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-44444444444c', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
SELECT 'D2 shot    ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
SELECT 'D3 finish  ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'completed', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-000000000001'));
SELECT 'D4 duplicate finish', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'completed', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-000000000001'));
SELECT 'D5 undo, play on   ', rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

\echo
\echo '=== E. accepted regressions — DENIED here, handled in the client ==='
SELECT 'E1 /sync adopts a pre-login guest game' AS case, rls_try('authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mk_upsert('55555555-5555-4555-8555-555555555555', 'completed', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

\echo
\echo '=== F. the Postgres behaviour this migration relies on ==='
BEGIN;
  DROP POLICY IF EXISTS "games_insert_anon" ON games;
  CREATE POLICY "games_insert_anon" ON games FOR INSERT TO anon
    WITH CHECK (created_by IS NULL AND status = 'active');   -- the trap
  SELECT 'F1 an INSERT WITH CHECK also gates DO UPDATE' AS case,
         rls_try('anon', NULL, mk_upsert('22222222-2222-4222-8222-222222222222', 'completed'));
ROLLBACK;

SELECT 'F2 a plain UPDATE failing USING is silent   ' AS case, rls_try('anon', NULL,
        $$UPDATE games SET status='abandoned' WHERE id='44444444-4444-4444-8444-444444444444'$$);
SELECT 'F3 ...an upsert of the same row raises      ', rls_try('anon', NULL,
        mk_upsert('44444444-4444-4444-8444-444444444444', 'active'));

\echo
\echo '=== final policy set ==='
SELECT policyname, cmd, roles::text, qual, with_check
  FROM pg_policies WHERE tablename = 'games' ORDER BY cmd, policyname;
