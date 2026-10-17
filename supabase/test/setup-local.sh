#!/usr/bin/env bash
#
# Brings up a throwaway Postgres, fakes the parts of Supabase the migrations
# rely on, and applies the whole migration chain from scratch.
#
# There is no local Supabase environment in this project (no config.toml), so
# there is nothing local to `supabase db push` to. This is how a migration gets
# verified before it reaches production; how it then gets there is in
# supabase/README.md ("Применение миграций к проду").
#
#   ./supabase/test/setup-local.sh          # start and migrate
#   ./supabase/test/setup-local.sh --stop   # tear down
#
# The database it builds carries a marker (schema kp_harness) and listens on a
# Unix socket only (listen_addresses empty). rls-policies.sql checks both before
# it writes anything.
#
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
PORT="${PGPORT:-55432}"
SOCK="${PGSOCK:-/tmp/kp-pg-sock}"
DATA="${PGDATA_DIR:-/tmp/kp-pgdata}"
MIGRATIONS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../migrations" && pwd)"

export PATH="$PGBIN:$PATH"

if [[ "${1:-}" == "--stop" ]]; then
  pg_ctl -D "$DATA" stop >/dev/null 2>&1 || true
  rm -rf "$DATA"
  echo "stopped"
  exit 0
fi

psql_run() { psql -h "$SOCK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

mkdir -p "$SOCK"
pg_ctl -D "$DATA" stop >/dev/null 2>&1 || true
rm -rf "$DATA"
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=" -l "$DATA/server.log" start >/dev/null
sleep 2

# The shim: what Supabase provides out of the box and the migrations assume.
# auth.uid() reads a GUC so tests can impersonate a user — see rls-policies.sql.
psql_run <<'SQL' >/dev/null
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), email text);
-- nullif matters: without it every anon case dies with 22P02 and reads as a
-- policy rejection
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE PUBLICATION supabase_realtime;
SQL
echo "shim ready"

for file in "$MIGRATIONS"/*.sql; do
  if psql_run -f "$file" >/dev/null 2>/tmp/kp-migration-error; then
    echo "  ok    $(basename "$file")"
  else
    echo "  FAIL  $(basename "$file")"
    head -20 /tmp/kp-migration-error
    exit 1
  fi
done

# The policies grant to roles; without table grants every case fails with the
# same SQLSTATE as a policy rejection and the tests would pass vacuously.
psql_run <<'SQL' >/dev/null
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
SQL

# The marker rls-policies.sql looks for before its first write. That file
# DELETEs every game; it must never run anywhere else. The cluster's
# system_identifier is unique per initdb, so a marker copied into another
# cluster (a dump restored somewhere) does not count.
psql_run <<'SQL' >/dev/null
CREATE SCHEMA kp_harness;
COMMENT ON SCHEMA kp_harness IS
  'Throwaway test database built by supabase/test/setup-local.sh. rls-policies.sql refuses to run where this schema is missing.';
CREATE TABLE kp_harness.marker AS
  SELECT c.system_identifier,
         current_setting('port')                    AS port,
         current_setting('unix_socket_directories') AS socket_dir,
         now()                                      AS built_at
    FROM pg_control_system() c;
SQL

echo
echo "ready:  psql -h $SOCK -p $PORT -U postgres"
echo "tests:  psql -h $SOCK -p $PORT -U postgres -v kp_port=$PORT -v kp_sock=$SOCK -f supabase/test/rls-policies.sql"
echo "        (exit 0 = every check passed; 3 = a check failed or the database was refused)"
