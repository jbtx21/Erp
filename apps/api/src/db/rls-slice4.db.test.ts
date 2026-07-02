// Integrationstest gegen ECHTES Postgres — RLS Slice 4 (ADR 0004): Härtung/Bootstrap.
// Prüft unter der LAUFZEIT-Rolle texma_app (RLS scharf, kein BYPASSRLS):
//   1. „ohne Tenant → abgelehnt/leer" (fail-closed) auf repräsentativen Tabellen.
//   2. Der Auth-Bootstrap (SECURITY-DEFINER-Funktionen aus Migration 0125) löst den
//      Tenant tenant-übergreifend auf, obwohl direkte Reads fail-closed sind.
//   3. Mit dem so aufgelösten Tenant-Kontext wird der Zugriff möglich (wie
//      resolveSessionWithTenant es in createContext tut).
//   4. EXPLAIN zeigt weiterhin einen InitPlan (F12-Wrapping bleibt gültig).
// Nur RUN_DB_TESTS=1. Fixtures als Owner (Bypass), Enforcement-Sicht via texma_app.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, PrismaClient } from "@texma/db";
import { tenantRlsClient } from "./tenant-prisma.js";
import { runWithTenant } from "./tenant-context.js";
import { hashToken } from "../modules/auth/token.js";

const T_B = "tenant_b_s4";
const U_B = "user_rls4_b";
const EMAIL_B = "rls4b@texma-gmbh.de";
const TOKEN = "rls4-token-gueltig";
const TOKEN_EXPIRED = "rls4-token-abgelaufen";

const RUNTIME_URL =
  process.env.DATABASE_URL_RUNTIME ??
  "postgresql://texma_app:texma_app@localhost:5432/texma?schema=public";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("RLS Slice 4 (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("RLS Slice 4 — Auth-Bootstrap + fail-closed unter texma_app", () => {
    // Roher texma_app-Blick (keine App-Verdrahtung) + verdrahteter Client (Extension).
    const appDb = new PrismaClient({ datasourceUrl: RUNTIME_URL });
    const wired = tenantRlsClient(new PrismaClient({ datasourceUrl: RUNTIME_URL }));

    async function cleanup() {
      await prisma.session.deleteMany({ where: { userId: U_B } });
      await prisma.user.deleteMany({ where: { id: U_B } });
      await prisma.tenant.deleteMany({ where: { id: T_B } });
    }

    beforeAll(async () => {
      await cleanup();
      // Fixtures als OWNER (Bypass): Fremdmandant B + ein User + zwei Sessions.
      await prisma.tenant.create({ data: { id: T_B, name: "Mandant B (S4)" } });
      await prisma.user.create({
        data: { id: U_B, email: EMAIL_B, name: "RLS4 B", role: "BUERO", passwordHash: "x", tenantId: T_B },
      });
      await prisma.session.create({
        data: { tokenHash: hashToken(TOKEN), userId: U_B, expiresAt: new Date(Date.now() + 3_600_000), tenantId: T_B },
      });
      await prisma.session.create({
        data: { tokenHash: hashToken(TOKEN_EXPIRED), userId: U_B, expiresAt: new Date(Date.now() - 1000), tenantId: T_B },
      });
    });

    afterAll(async () => {
      await cleanup();
      await appDb.$disconnect();
      await wired.$disconnect();
      await prisma.$disconnect();
    });

    // ── (1) fail-closed: ohne Tenant-Kontext leer/abgelehnt ──────────────────────

    it("ohne Tenant-Kontext: SELECT ist leer (User/Session/Company)", async () => {
      expect(await appDb.user.count()).toBe(0);
      expect(await appDb.session.count()).toBe(0);
      expect(await appDb.company.count()).toBe(0);
    });

    it("ohne Tenant-Kontext: INSERT wird abgelehnt (WITH CHECK, fail-closed)", async () => {
      await expect(
        appDb.user.create({ data: { email: "evil@texma-gmbh.de", name: "Evil", role: "BUERO", passwordHash: "x" } })
      ).rejects.toThrow(/row-level security/i);
    });

    // ── (2) Bootstrap: SECURITY-DEFINER-Funktionen lösen den Tenant auf ───────────

    it("auth_resolve_session löst den Tenant tenant-übergreifend auf (gültiges Token)", async () => {
      const rows = await appDb.$queryRaw<Array<{ user_id: string; tenant_id: string }>>`
        SELECT user_id, tenant_id FROM auth_resolve_session(${hashToken(TOKEN)})
      `;
      expect(rows).toEqual([{ user_id: U_B, tenant_id: T_B }]);
    });

    it("auth_resolve_session liefert NICHTS für abgelaufene Tokens", async () => {
      const rows = await appDb.$queryRaw<Array<unknown>>`
        SELECT user_id, tenant_id FROM auth_resolve_session(${hashToken(TOKEN_EXPIRED)})
      `;
      expect(rows).toEqual([]);
    });

    it("auth_resolve_login löst den Tenant per E-Mail auf (tenant-übergreifend)", async () => {
      const rows = await appDb.$queryRaw<Array<{ user_id: string; tenant_id: string }>>`
        SELECT user_id, tenant_id FROM auth_resolve_login(${EMAIL_B})
      `;
      expect(rows).toEqual([{ user_id: U_B, tenant_id: T_B }]);
    });

    // ── (3) Mit aufgelöstem Tenant wird der Zugriff möglich (Bootstrap-Kette) ──────

    it("Bootstrap-Kette: aufgelöster Tenant → User im Kontext ladbar (wie resolveSessionWithTenant)", async () => {
      // Schritt A: Tenant tenant-übergreifend bestimmen (SECURITY DEFINER).
      const rows = await appDb.$queryRaw<Array<{ tenant_id: string }>>`
        SELECT tenant_id FROM auth_resolve_session(${hashToken(TOKEN)})
      `;
      const tenantId = rows[0]?.tenant_id ?? "";
      // Schritt B: regulärer Load im gesetzten Tenant-Kontext (verdrahteter Client).
      // WICHTIG: INNERHALB von runWithTenant awaiten (Prisma-Promises sind lazy — erst das
      // await startet die Operation im ALS-Tenant-Kontext; s. rls-slice2.db.test.ts).
      const user = await runWithTenant(tenantId, async () => await wired.user.findUnique({ where: { id: U_B } }));
      expect(user?.id).toBe(U_B);
      expect(user?.tenantId).toBe(T_B);
      // Ohne Kontext bleibt derselbe Client fail-closed:
      expect(await wired.user.count()).toBe(0);
    });

    // ── (4) F12: InitPlan bleibt (current_setting einmal pro Query) ───────────────

    it("EXPLAIN zeigt weiterhin InitPlan auf der Auth-Tabelle User", async () => {
      const [, plan] = await appDb.$transaction([
        appDb.$executeRaw`SELECT set_config('app.tenant_id', ${T_B}, true)`,
        appDb.$queryRaw<Array<{ "QUERY PLAN": string }>>`EXPLAIN SELECT * FROM "User"`,
      ]);
      const text = plan.map((r) => r["QUERY PLAN"]).join("\n");
      expect(text).toMatch(/InitPlan/);
    });
  });
}
