#!/usr/bin/env bash
#
# Brings up a throwaway Postgres, fakes the parts of Supabase the migrations
# rely on, and applies the whole migration chain from scratch.
#
# There is no local Supabase environment in this project (no config.toml), and
# `supabase db push` is not usable either: the project is not linked and the
# migration history table is empty, so a push would start from 00001. This is
# how a migration gets verified before it reaches production.
#
#   ./supabase/test/setup-local.sh          # start and migrate
#   ./supabase/test/setup-local.sh --stop   # tear down
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

echo
echo "ready:  psql -h $SOCK -p $PORT -U postgres"
echo "tests:  psql -h $SOCK -p $PORT -U postgres -f supabase/test/rls-policies.sql"
