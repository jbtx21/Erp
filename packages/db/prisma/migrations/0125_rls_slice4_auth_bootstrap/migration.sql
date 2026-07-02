-- RLS Slice 4 — Härtung (ADR 0004): Auth-Bootstrap-Funktionen (Priorität 1).
--
-- PROBLEM (von Slice 3 markiert): Unter der Laufzeit-Rolle `texma_app` (RLS scharf,
-- kein BYPASSRLS) läuft der Session-/Login-Lookup in `createContext`, BEVOR der Tenant
-- bekannt ist → ohne app.tenant_id sind alle RLS-Policies NULL → 0 Zeilen (fail-closed)
-- → NIEMAND kann sich einloggen. Klassisches „Henne-Ei": den Tenant braucht man, um
-- die Session zu lesen, aber die Session sagt einem erst den Tenant.
--
-- LÖSUNG: minimaler, kontrollierter Bypass über SECURITY DEFINER-Funktionen. Sie laufen
-- mit den Rechten ihres BESITZERS (der Owner-/Migrationsrolle `texma`, die RLS umgeht —
-- KEIN FORCE auf User/Session, s. u.), lesen also tenant-übergreifend, geben aber NUR
-- IDs + tenant_id zurück (keine Passwort-Hashes/Secrets). Der eigentliche User-/Session-
-- Load passiert danach in der App im dann gesetzten Tenant-Kontext (runWithTenant).
--   * REVOKE ALL FROM PUBLIC → keine implizite Ausführbarkeit.
--   * GRANT EXECUTE nur an `texma_app` (die Laufzeit-Rolle).
--   * SET search_path = pg_catalog, public → kein Search-Path-Hijacking (SECURITY-DEFINER-
--     Härtungsempfehlung der Postgres-Doku).
--
-- Unter der OWNER-URL (Dev-Standard) liefern dieselben Funktionen dasselbe Ergebnis
-- (der Owner umgeht RLS ohnehin) → KEINE Regression, der Bestand bleibt grün.
--
-- BEWUSST KEIN `FORCE ROW LEVEL SECURITY` in dieser Migration — Begründung im ADR 0004
-- (Slice-4-Protokoll): FORCE würde den Owner-Bypass aufheben und damit sowohl den Seed
-- als auch die ~40 owner-laufenden Integrationstests (die Order/Invoice/Payment ohne
-- Tenant-Kontext schreiben) rot färben. Empirisch verifiziert (0 Zeilen für den Owner
-- unter FORCE ohne Kontext). „Grün-haltend vor vollständig" → FORCE verschoben.
-- ZUSÄTZLICH würde FORCE auf User/Session die SECURITY-DEFINER-Funktionen selbst brechen
-- (auch sie liefen dann unter RLS ohne Kontext) — die Auth-Tabellen dürfen NIE FORCE tragen.

-- ── auth_resolve_session ──────────────────────────────────────────────────────
-- Session-Token-HASH (SHA-256, in der App gebildet — hashToken(), token.ts) → user_id +
-- tenant_id, tenant-übergreifend, NUR für gültige (nicht abgelaufene) Sessions. Der
-- Parameter ist bewusst der HASH (nicht das Klartext-Token): so bleibt die Hash-Bildung
-- an EINER Stelle (App) und Postgres braucht keine pgcrypto-Abhängigkeit. pendingTotp
-- wird hier NICHT gefiltert — die App prüft das erneut im Tenant-Kontext (resolveSession);
-- für den 2FA-Zwischenschritt muss der Tenant auch bei pendingTotp auflösbar sein.
CREATE OR REPLACE FUNCTION auth_resolve_session(p_token_hash text)
RETURNS TABLE(user_id text, tenant_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u."id", u."tenantId"
  FROM "Session" s
  JOIN "User" u ON u."id" = s."userId"
  WHERE s."tokenHash" = p_token_hash
    AND s."expiresAt" > now()
$$;

REVOKE ALL ON FUNCTION auth_resolve_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_resolve_session(text) TO texma_app;

-- ── auth_resolve_login ────────────────────────────────────────────────────────
-- E-Mail → user_id + tenant_id, tenant-übergreifend, für den Passwort-Login-Lookup
-- (die App setzt danach runWithTenant(tenant_id) um loginWithPassword). Liefert NUR
-- IDs/tenant, KEINEN Passwort-Hash — die Passwortprüfung passiert im Tenant-Kontext.
--
-- 1-TENANT-ANNAHME (dokumentiert): User.email ist heute GLOBAL eindeutig (Single-Tenant-
-- Bestand). Bei echter Multi-Tenancy muss E-Mail je Tenant eindeutig sein (nicht global)
-- und die Auflösung über Subdomain/Claim laufen (resolveTenantFromRequest, tenant-auth.ts)
-- ODER diese Funktion mehrere Zeilen liefern; dann darf der Login sich NICHT mehr allein
-- auf die E-Mail verlassen. Solange global-eindeutig, liefert die Funktion ≤1 Zeile.
CREATE OR REPLACE FUNCTION auth_resolve_login(p_email text)
RETURNS TABLE(user_id text, tenant_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u."id", u."tenantId"
  FROM "User" u
  WHERE lower(u."email") = lower(p_email)
    AND u."active"
$$;

REVOKE ALL ON FUNCTION auth_resolve_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_resolve_login(text) TO texma_app;
