#!/bin/bash
# B17 Modus B: Hot-Standby-Entrypoint. Bei leerem Datenverzeichnis ein Base-Backup
# vom Primary ziehen (pg_basebackup -R schreibt standby.signal + primary_conninfo),
# danach Postgres als Read-Only-Hot-Standby starten. Spiegelt das Root→postgres-
# Step-down des offiziellen Images (su-exec) für korrekte Dateirechte.
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PRIMARY_HOST="${PRIMARY_HOST:-primary}"
REPLICATION_USER="${REPLICATION_USER:-replicator}"

# Als root: Verzeichnis vorbereiten und auf postgres herabstufen.
if [ "$(id -u)" = '0' ]; then
  mkdir -p "$PGDATA"
  chown -R postgres "$PGDATA"
  chmod 700 "$PGDATA"
  exec su-exec postgres "$0" "$@"
fi

# Ab hier als postgres-Nutzer.
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "standby: warte auf Primary ${PRIMARY_HOST} …"
  until pg_isready -h "$PRIMARY_HOST" -U "$REPLICATION_USER" -q; do sleep 2; done

  echo "standby: pg_basebackup vom Primary …"
  export PGPASSWORD="${REPLICATION_PASSWORD:-replicator}"
  # -Fp plain, -Xs Stream-WAL, -R Standby-Config, -S benannter Slot, -P Fortschritt.
  pg_basebackup \
    -h "$PRIMARY_HOST" \
    -U "$REPLICATION_USER" \
    -D "$PGDATA" \
    -Fp -Xs -P -R \
    -S standby_slot
  chmod 700 "$PGDATA"
  echo "standby: Base-Backup fertig — starte als Hot-Standby."
fi

exec postgres -c hot_standby=on
