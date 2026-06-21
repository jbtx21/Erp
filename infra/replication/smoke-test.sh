#!/bin/bash
# B17 Modus B — Replikations-Smoke-Test. Validiert, dass der Hot-Standby den Primary
# asynchron streamt (RPO sekunden-nah) und read-only ist. Beweist den Datenfluss vor
# einem echten Failover-Drill.
#
#   docker compose -f docker-compose.replication.yml up -d
#   ./smoke-test.sh
#
# Exit 0 = alle Checks grün. Exit 1 = Replikation fehlerhaft.
set -euo pipefail

COMPOSE="docker compose -f $(dirname "$0")/docker-compose.replication.yml"
PRIMARY="$COMPOSE exec -T primary"
STANDBY="$COMPOSE exec -T standby"
DB="${POSTGRES_DB:-texma}"
USER="${POSTGRES_USER:-texma}"
PSQL_P="$PRIMARY psql -qtAX -U $USER -d $DB"
PSQL_S="$STANDBY psql -qtAX -U $USER -d $DB"
SENTINEL="b17_smoke_$(date +%s)"
fail() { echo "❌ FAIL: $1"; exit 1; }

echo "== B17 Modus B Smoke-Test =="

# 1) Standby ist tatsächlich im Recovery (= Replikat, nicht eigenständig).
echo -n "1) Standby in Recovery … "
[ "$($PSQL_S -c 'SELECT pg_is_in_recovery();' | tr -d '[:space:]')" = "t" ] || fail "Standby ist nicht im Recovery-Modus."
echo "ok"

# 2) Primary sieht einen streamenden WAL-Sender.
echo -n "2) WAL-Sender state=streaming … "
state="$($PSQL_P -c "SELECT state FROM pg_stat_replication LIMIT 1;" | tr -d '[:space:]')"
[ "$state" = "streaming" ] || fail "kein streamender Standby (state='$state')."
echo "ok"

# 3) Schreiben auf Primary → erscheint auf Standby (Datenfluss).
echo -n "3) Insert auf Primary -> Lesen auf Standby … "
$PSQL_P -c "CREATE TABLE IF NOT EXISTS _b17_smoke(id text primary key, t timestamptz default now());" >/dev/null
$PSQL_P -c "INSERT INTO _b17_smoke(id) VALUES ('$SENTINEL');" >/dev/null
found=""
for _ in $(seq 1 30); do
  if [ "$($PSQL_S -c "SELECT 1 FROM _b17_smoke WHERE id='$SENTINEL';" | tr -d '[:space:]')" = "1" ]; then
    found=1; break
  fi
  sleep 0.5
done
[ -n "$found" ] || fail "Sentinel-Zeile binnen 15 s nicht auf dem Standby repliziert."
echo "ok"

# 4) Replikations-Lag (RPO-Indikator).
echo -n "4) Replikations-Lag … "
lag="$($PSQL_P -c "SELECT COALESCE(EXTRACT(EPOCH FROM (now()-reply_time))::int, 0) FROM pg_stat_replication LIMIT 1;" | tr -d '[:space:]')"
echo "${lag:-0}s (Ziel: sekunden-nah)"

# 5) Standby ist read-only (Schreibversuch muss scheitern).
echo -n "5) Standby read-only … "
if $PSQL_S -c "INSERT INTO _b17_smoke(id) VALUES ('should_fail');" >/dev/null 2>&1; then
  fail "Standby akzeptiert Schreibzugriff — kein echter Read-Replica-Schutz."
fi
echo "ok"

# Aufräumen (nur Primary, propagiert zum Standby).
$PSQL_P -c "DROP TABLE IF EXISTS _b17_smoke;" >/dev/null

echo "✅ PASS — Streaming-Replikation aktiv, Standby read-only, Lag sekunden-nah."
