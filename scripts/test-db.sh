#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres and runs supabase/tests.
# Needs PostgreSQL 15+ binaries (initdb, pg_ctl, psql). No Supabase project required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DIR="$(mktemp -d)"; PORT="${PG_TEST_PORT:-54329}"
run() { if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; su postgres -c "$*"; else bash -c "$*"; fi; }
cleanup() { run "$BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
run "$BIN/initdb -D $DIR/data -U postgres -A trust" >/dev/null
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c listen_addresses=' -l $DIR/log -w start" >/dev/null
P="psql -X -q -v ON_ERROR_STOP=1 -h $DIR -p $PORT -U postgres"
$P -f "$ROOT/supabase/tests/00_stub_auth.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $P -f "$f"; done
$P -f "$ROOT/supabase/tests/01_rls.sql" 2>&1 | grep -E "ok  |FAIL|ERROR|PASSED" 
