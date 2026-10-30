#!/usr/bin/env bash
# Spins up a throwaway Postgres, applies the migration on a Supabase stub, runs the security tests.
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-54329}
cd "$(dirname "$0")/../.."
"$PGBIN/initdb" -D "$DIR" -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null; rm -rf "$DIR"' EXIT
PSQL=("$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f supabase/tests/security_test.sql
