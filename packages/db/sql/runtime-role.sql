-- Laufzeit-Rolle texma_app — RLS-Rollentrennung (ADR 0004, Slice 1; Research F13).
--
-- WARUM (Owner-Bypass): Postgres umgeht RLS für die TABELLENBESITZENDE Rolle und für
-- Superuser OHNE Fehlermeldung. Im Prisma-Standard-Setup (EINE DATABASE_URL für
-- `migrate` und App-Client) ist die App-Rolle zugleich Table Owner → NULL Tenant-
-- Isolation, obwohl Policies existieren und alles grün aussieht. Deshalb:
--   * Migrations-Rolle (z. B. `texma`) = Table Owner, führt `prisma migrate` aus.
--   * Laufzeit-Rolle `texma_app` = LOGIN, NOSUPERUSER, NOBYPASSRLS, KEIN Ownership —
--     nur DML-Rechte. Der App-Client verbindet sich ab Slice 2 zwingend über
--     DATABASE_URL_RUNTIME mit dieser Rolle (siehe .env.example).
--
-- AUSFÜHRUNG: kein Prisma-Migrationsschritt, weil Rollen CLUSTER-weit sind (nicht
-- pro Datenbank) und das Passwort umgebungsspezifisch gesetzt wird. Skript ist
-- IDEMPOTENT (mehrfach ausführbar). Als Migrations-/Owner-Rolle ausführen (braucht
-- CREATEROLE; ALTER DEFAULT PRIVILEGES wirkt auf Objekte des Ausführenden):
--
--   psql "$DATABASE_URL" -f packages/db/sql/runtime-role.sql
--
-- Das Initialpasswort 'texma_app' ist NUR ein Dev-Default — in jeder echten
-- Umgebung sofort ersetzen: ALTER ROLE texma_app PASSWORD '<secret>';

-- Rolle anlegen (nur wenn sie fehlt — Passwort eines bestehenden Rollen-Setups
-- wird bei erneutem Lauf NICHT überschrieben). Danach WÄCHTER statt ALTER
-- (NOSUPERUSER/NOBYPASSRLS darf nur ein Superuser setzen): existiert die Rolle
-- bereits MIT Bypass-Attributen, bricht das Skript laut ab — eine solche Rolle
-- würde RLS still umgehen (genau der F13-Fallstrick).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'texma_app') THEN
    CREATE ROLE texma_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
      PASSWORD 'texma_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'texma_app' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'texma_app hat SUPERUSER/BYPASSRLS — RLS wäre wirkungslos (ADR 0004 F13). Manuell korrigieren: ALTER ROLE texma_app NOSUPERUSER NOBYPASSRLS;';
  END IF;
END
$$;

-- DML auf dem Bestand — bewusst KEIN Ownership, kein DDL, kein TRUNCATE.
GRANT USAGE ON SCHEMA public TO texma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO texma_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO texma_app;

-- Zukünftige Tabellen/Sequenzen (neue Migrationen der Owner-Rolle) automatisch
-- mitberechtigen — sonst bricht die App nach jeder Migration mit "permission denied".
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO texma_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO texma_app;
