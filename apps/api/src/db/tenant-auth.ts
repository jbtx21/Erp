// Auth-Bootstrap für RLS (ADR 0004, Slice 4) — löst das „Henne-Ei" der Mandanten-
// auflösung VOR der Authentifizierung: Unter der Laufzeit-Rolle `texma_app` (RLS scharf,
// kein BYPASSRLS) liefert JEDER Tabellenzugriff ohne gesetzten `app.tenant_id` 0 Zeilen
// (fail-closed). Der Session-/Login-Lookup in `createContext` läuft aber, BEVOR der Tenant
// bekannt ist → ohne Bootstrap könnte sich niemand einloggen.
//
// Lösung: die SECURITY-DEFINER-Funktionen aus Migration 0125 (`auth_resolve_session`,
// `auth_resolve_login`) lesen tenant-übergreifend (mit Owner-Rechten, RLS-umgehend) und
// geben NUR user_id + tenant_id zurück. Damit setzen wir den Tenant-Kontext (runWithTenant)
// und laden Session/User erst DANN regulär im gesetzten Kontext — der eigentliche RLS-Pfad.
//
// Unter der OWNER-URL (Dev-Standard) ist die tenant-rls-Extension nicht installiert und der
// Owner umgeht RLS ohnehin; dieselben Funktionen liefern dasselbe Ergebnis → KEINE Regression.

import { prisma } from "@texma/db";
import type { AuthService, AuthUser } from "../modules/auth/auth.service.js";
import { hashToken } from "../modules/auth/token.js";
import { DEFAULT_TENANT_ID, runWithTenant } from "./tenant-context.js";

interface TenantRow {
  tenant_id: string;
}

/**
 * Tenant eines gültigen (nicht abgelaufenen) Session-Tokens — via SECURITY-DEFINER-
 * Funktion `auth_resolve_session`. Erwartet das ROH-Token (die SHA-256-Hash-Bildung
 * passiert hier zentral, analog zum Session-Repo). `null`, wenn kein gültiges Token.
 */
export async function resolveTenantForSession(token: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<TenantRow[]>`
    SELECT tenant_id FROM auth_resolve_session(${hashToken(token)})
  `;
  return rows[0]?.tenant_id ?? null;
}

/**
 * Tenant zu einer Login-E-Mail — via SECURITY-DEFINER-Funktion `auth_resolve_login`
 * (tenant-übergreifend). `null`, wenn keine (aktive) Adresse passt. 1-Tenant-Annahme:
 * E-Mail ist heute global eindeutig (s. Migration 0125). Bereitgestellt + getestet für
 * den Multi-Tenant-Login; aktuell noch nicht in die Login-Procedure verdrahtet (der
 * Single-Tenant-Login läuft über den Default-Tenant der withTenant-Middleware — TODO
 * Multi-Tenant: hier auflösen und `loginWithPassword` in runWithTenant(tenantId) hüllen).
 */
export async function resolveTenantForLogin(email: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<TenantRow[]>`
    SELECT tenant_id FROM auth_resolve_login(${email.toLowerCase()})
  `;
  return rows[0]?.tenant_id ?? null;
}

/**
 * Session-Auflösung MIT Tenant-Bootstrap: erst den Tenant aus dem Token bestimmen
 * (RLS-umgehend), dann Session/User im gesetzten Tenant-Kontext regulär laden. Ersetzt
 * das nackte `auth.resolveSession(token)` an allen Aufrufstellen (createContext, /logos),
 * damit der Lookup auch unter `texma_app` funktioniert. Fail-closed: kein Tenant → kein User.
 */
export async function resolveSessionWithTenant(auth: AuthService, token: string): Promise<AuthUser | null> {
  const tenantId = await resolveTenantForSession(token);
  if (!tenantId) return null;
  return runWithTenant(tenantId, () => auth.resolveSession(token));
}

/**
 * Tenant-Auflösung aus dem Request (Subdomain/Claim) — Slice-4-STUB. Heute Single-Tenant:
 * liefert immer den Default-Tenant. TODO (echte Multi-Tenancy): Subdomain (z. B.
 * `mandant-a.erp.texma-gmbh.de`) oder einen verifizierten Tenant-Claim aus dem OIDC-Token
 * auswerten. Bewusst als Platzhalter belassen — keine echte Subdomain-Infra nötig (ADR 0004,
 * Slice 4: „Design/Stub genügt").
 */
export function resolveTenantFromRequest(_req: unknown): string {
  return DEFAULT_TENANT_ID;
}
