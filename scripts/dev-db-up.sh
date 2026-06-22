#!/usr/bin/env bash
# Lokales Postgres für die Dev-Umgebung hochfahren — OHNE Docker (Fallback, wenn
# kein Docker-Daemon läuft, z. B. in der Cloud-Ausführungsumgebung). Nutzt das
# installierte postgresql-16-Serverpaket und einen Cluster unter /tmp.
#
# Normalfall auf einem Entwicklungsrechner: stattdessen Docker verwenden
#   docker run --rm -d -p 5432:5432 -e POSTGRES_USER=texma -e POSTGRES_PASSWORD=texma -e POSTGRES_DB=texma postgres:16
#
# Danach:  pnpm db:setup   (generate + migrate:deploy + seed)
#          node apps/api/dist/scripts/dev-server.js   # API :3000
#          pnpm --filter @texma/web dev               # UI  :5173
set -euo pipefail

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] || { echo "Kein Postgres-Server gefunden (apt-get install postgresql-16)."; exit 1; }

PGDATA=/tmp/texma-pg
PGPORT="${PGPORT:-5432}"

# initdb/Server müssen als unprivilegierter Nutzer laufen (nicht root).
RUNUSER="$(id -u postgres >/dev/null 2>&1 && echo postgres || echo "$(whoami)")"
run() { if [ "$(whoami)" = "root" ] && [ "$RUNUSER" != "root" ]; then su -s /bin/bash "$RUNUSER" -c "$1"; else bash -c "$1"; fi; }

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  rm -rf "$PGDATA"
  run "mkdir -p $PGDATA && chmod 700 $PGDATA && $PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8"
fi

if ! run "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
  run "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT' -l $PGDATA/server.log start"
  sleep 2
fi

# Rolle + Datenbank passend zur committeten packages/db/.env (texma/texma).
run "$PGBIN/psql -p $PGPORT -U postgres -tc \"SELECT 1 FROM pg_roles WHERE rolname='texma'\" | grep -q 1 || $PGBIN/psql -p $PGPORT -U postgres -c \"CREATE ROLE texma LOGIN SUPERUSER PASSWORD 'texma'\""
run "$PGBIN/psql -p $PGPORT -U postgres -tc \"SELECT 1 FROM pg_database WHERE datname='texma'\" | grep -q 1 || $PGBIN/psql -p $PGPORT -U postgres -c 'CREATE DATABASE texma OWNER texma'"

echo "Postgres läuft auf localhost:$PGPORT (DB 'texma', Rolle 'texma')."
echo "DATABASE_URL=postgresql://texma:texma@localhost:$PGPORT/texma?schema=public"
