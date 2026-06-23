#!/usr/bin/env bash
# Wiederherstellung der ERP-Datenbank aus einem Backup (Kap. 27, NFR: RTO 8 h).
# Prüft zuerst den SHA-256-Wert, dann pg_restore in die Ziel-DB (DROP/CREATE der Objekte).
#
# ACHTUNG: überschreibt die Ziel-Datenbank. Vorher sicher sein, dass die richtige
# DATABASE_URL gesetzt ist (NICHT versehentlich Produktiv überschreiben).
#
#   DATABASE_URL=postgresql://texma:texma@localhost:5432/texma_restore \
#   scripts/restore.sh /var/backups/texma/texma-20260623-020000.dump
set -euo pipefail

DUMP="${1:?Pfad zur .dump-Datei angeben}"
DB_URL="${DATABASE_URL:?DATABASE_URL muss gesetzt sein}"

[ -f "$DUMP" ] || { echo "Backup-Datei nicht gefunden: $DUMP"; exit 1; }

if [ -f "$DUMP.sha256" ]; then
  echo "[$(date -Is)] Prüfe Integrität ($DUMP.sha256) …"
  sha256sum -c "$DUMP.sha256"
else
  echo "[$(date -Is)] WARN: keine .sha256-Prüfdatei neben dem Backup gefunden."
fi

echo "[$(date -Is)] Restore aus $DUMP in $DB_URL …"
# --clean --if-exists: vorhandene Objekte vor dem Einspielen entfernen; --no-owner: portabel.
pg_restore --dbname="$DB_URL" --clean --if-exists --no-owner --single-transaction "$DUMP"
echo "[$(date -Is)] Restore abgeschlossen."
