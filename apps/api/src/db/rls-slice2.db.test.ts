// Integrationstest gegen ECHTES Postgres — RLS Slice 2 (ADR 0004): Tenant-Isolation
// der Wurzeltabellen unter der LAUFZEIT-Rolle texma_app. Unter der Owner-Rolle wäre
// der Test wertlos (Owner-Bypass, F13) — deshalb verbindet er sich zusätzlich zum
// Owner-Client (Fixtures) über DATABASE_URL_RUNTIME bzw. das Dev-Default-Passwort
// aus packages/db/sql/runtime-role.sql. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, PrismaClient } from "@texma/db";
import { tenantRlsClient } from "./tenant-prisma.js";
import { runWithTenant } from "./tenant-context.js";

const T_B = "tenant_b";
const CO_TEXMA = "co_rls2_texma";
const CO_B = "co_rls2_b";
const CO_EVIL = "co_rls2_evil";
const BEIDE = [CO_TEXMA, CO_B, CO_EVIL];

// Laufzeit-Rolle: Dev-Default-Passwort 'texma_app' (runtime-role.sql; in echten
// Umgebungen ersetzt — dann DATABASE_URL_RUNTIME setzen).
const RUNTIME_URL =
  process.env.DATABASE_URL_RUNTIME ??
  "postgresql://texma_app:texma_app@localhost:5432/texma?schema=public";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("RLS Slice 2 (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("RLS Slice 2 — Tenant-Isolation unter der Laufzeit-Rolle texma_app", () => {
    // texma_app-Client OHNE App-Verdrahtung (roher Blick der Laufzeit-Rolle auf die DB).
    const appDb = new PrismaClient({ datasourceUrl: RUNTIME_URL });
    // texma_app-Client MIT der Slice-2-Verdrahtung (Extension + $transaction-Abfangjäger).
    const wired = tenantRlsClient(new PrismaClient({ datasourceUrl: RUNTIME_URL }));

    /** set_config('app.tenant_id', …, true) ≙ SET LOCAL — nur im Batch-$transaction sinnvoll. */
    const setTenant = (tenantId: string) =>
      appDb.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    async function cleanup() {
      await prisma.company.deleteMany({ where: { id: { in: BEIDE } } });
      await prisma.tenant.deleteMany({ where: { id: T_B } });
    }

    let priceGroupId = "";

    beforeAll(async () => {
      await cleanup();
      // Fixtures als OWNER (Bypass): zweiter Tenant + je eine Company pro Mandant.
      await prisma.tenant.create({ data: { id: T_B, name: "Mandant B" } });
      const pg = await prisma.priceGroup.upsert({
        where: { kind: "STANDARD" },
        update: {},
        create: { kind: "STANDARD", name: "Standard" },
      });
      priceGroupId = pg.id;
      await prisma.company.create({ data: { id: CO_TEXMA, name: "TEXMA Kunde", priceGroupId, tenantId: "tenant_texma" } });
      await prisma.company.create({ data: { id: CO_B, name: "Fremdmandant Kunde", priceGroupId, tenantId: T_B } });
    });

    afterAll(async () => {
      await cleanup();
      await appDb.$disconnect();
      await wired.$disconnect();
      await prisma.$disconnect();
    });

    it("a) Kontext tenant_texma sieht NUR die texma-Company", async () => {
      const [, rows] = await appDb.$transaction([
        setTenant("tenant_texma"),
        appDb.company.findMany({ where: { id: { in: BEIDE } }, select: { id: true } }),
      ]);
      expect(rows.map((r) => r.id)).toEqual([CO_TEXMA]);
    });

    it("b) Kontext tenant_b sieht NUR die b-Company", async () => {
      const [, rows] = await appDb.$transaction([
        setTenant(T_B),
        appDb.company.findMany({ where: { id: { in: BEIDE } }, select: { id: true } }),
      ]);
      expect(rows.map((r) => r.id)).toEqual([CO_B]);
    });

    it("c) ohne Tenant-Kontext: 0 Zeilen (fail-closed)", async () => {
      // current_setting('app.tenant_id', true) ist NULL → Policy-Vergleich NULL → nichts sichtbar.
      expect(await appDb.company.count()).toBe(0);
      expect(await appDb.user.count()).toBe(0);
    });

    it("d) INSERT mit fremder tenantId wird von WITH CHECK abgelehnt", async () => {
      await expect(
        appDb.$transaction([
          setTenant(T_B),
          appDb.company.create({ data: { id: CO_EVIL, name: "Eingeschleust", priceGroupId, tenantId: "tenant_texma" } }),
        ])
      ).rejects.toThrow(/row-level security/i);
      // Nichts persistiert (Owner-Blick):
      expect(await prisma.company.count({ where: { id: CO_EVIL } })).toBe(0);
    });

    it("e) EXPLAIN zeigt InitPlan — current_setting wird EINMAL pro Query evaluiert (F12)", async () => {
      const [, plan] = await appDb.$transaction([
        setTenant("tenant_texma"),
        appDb.$queryRaw<Array<{ "QUERY PLAN": string }>>`EXPLAIN SELECT * FROM "Company"`,
      ]);
      const text = plan.map((r) => r["QUERY PLAN"]).join("\n");
      expect(text).toMatch(/InitPlan/);
    });

    // ── App-Verdrahtung (tenant-prisma.ts): Extension + $transaction-Abfangjäger ──

    it("Verdrahtung: einzelne Operation läuft im Tenant-Kontext (runWithTenant)", async () => {
      // WICHTIG: innerhalb von runWithTenant AWAITEN (wie die tRPC-Resolver) — Prisma-
      // Promises sind lazy, erst das await startet die Operation im Tenant-Kontext.
      const rows = await runWithTenant("tenant_texma", async () => {
        return await wired.company.findMany({ where: { id: { in: BEIDE } }, select: { id: true } });
      });
      expect(rows.map((r) => r.id)).toEqual([CO_TEXMA]);
      // Ohne Kontext bleibt der verdrahtete Client fail-closed:
      expect(await wired.company.count()).toBe(0);
    });

    it("Verdrahtung: interaktive Transaktion setzt den Tenant am Transaktionsanfang", async () => {
      const seen = await runWithTenant(T_B, () =>
        wired.$transaction(async (tx) => {
          const inTx = await tx.company.findMany({ where: { id: { in: BEIDE } }, select: { id: true } });
          await tx.company.update({ where: { id: CO_B }, data: { notiz: "aus itx" } });
          return inTx;
        })
      );
      expect(seen.map((r) => r.id)).toEqual([CO_B]);
      expect((await prisma.company.findUnique({ where: { id: CO_B } }))?.notiz).toBe("aus itx");
    });

    it("Verdrahtung: Batch-$transaction bekommt set_config vorangestellt", async () => {
      const [texmaSicht, bSicht] = await runWithTenant("tenant_texma", () =>
        wired.$transaction([
          wired.company.count({ where: { id: { in: BEIDE } } }),
          wired.company.count({ where: { id: CO_B } }),
        ])
      );
      expect(texmaSicht).toBe(1); // nur CO_TEXMA
      expect(bSicht).toBe(0); // Fremdmandant unsichtbar
    });
  });
}
