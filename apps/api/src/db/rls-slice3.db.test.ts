// Integrationstest gegen ECHTES Postgres — RLS Slice 3 (ADR 0004): Tenant-Isolation der
// KINDER-Tabellen unter der LAUFZEIT-Rolle texma_app (Owner-Bypass F13 → Owner-Blick wäre
// wertlos). Repräsentative Auswahl: OrderLine/QuoteLine (Belege-Kinder), StockMove
// (F4-Ledger), PurchaseOrderLine (Beschaffung). Muster analog rls-slice2.db.test.ts.
// Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, PrismaClient } from "@texma/db";

const T_B = "tenant_b3";
// Fixture-IDs (Owner legt beide Mandanten an; texma_app prüft die Sicht).
const CO = "co_rls3";
const PG_KIND = "STANDARD";
const ART = "art_rls3";
const VAR_A = "var_rls3_a";
const VAR_B = "var_rls3_b";
const SUP = "sup_rls3";
const ORDER_A = "ord_rls3_a";
const ORDER_B = "ord_rls3_b";
const OL_A = "ol_rls3_a";
const OL_B = "ol_rls3_b";
const PO_A = "po_rls3_a";
const PO_B = "po_rls3_b";
const POL_A = "pol_rls3_a";
const POL_B = "pol_rls3_b";
const SM_A = "sm_rls3_a";
const SM_B = "sm_rls3_b";

const RUNTIME_URL =
  process.env.DATABASE_URL_RUNTIME ??
  "postgresql://texma_app:texma_app@localhost:5432/texma?schema=public";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("RLS Slice 3 (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("RLS Slice 3 — Tenant-Isolation der Kinder-Tabellen unter texma_app", () => {
    // Roher texma_app-Blick (ohne App-Verdrahtung) — set_config steuert den Kontext.
    const appDb = new PrismaClient({ datasourceUrl: RUNTIME_URL });
    const setTenant = (tenantId: string) =>
      appDb.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    async function cleanup() {
      // Reihenfolge: Kinder vor Eltern (FKs). Owner-Blick (Bypass).
      await prisma.stockMove.deleteMany({ where: { id: { in: [SM_A, SM_B] } } });
      await prisma.purchaseOrderLine.deleteMany({ where: { id: { in: [POL_A, POL_B] } } });
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: [PO_A, PO_B] } } });
      await prisma.orderLine.deleteMany({ where: { id: { in: [OL_A, OL_B] } } });
      await prisma.order.deleteMany({ where: { id: { in: [ORDER_A, ORDER_B] } } });
      await prisma.supplier.deleteMany({ where: { id: SUP } });
      await prisma.variant.deleteMany({ where: { id: { in: [VAR_A, VAR_B] } } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.tenant.deleteMany({ where: { id: T_B } });
    }

    beforeAll(async () => {
      await cleanup();
      // ── Fixtures als OWNER (Bypass): PriceGroup ist global/exempt (geteilt). ──
      await prisma.tenant.create({ data: { id: T_B, name: "Mandant B (Slice 3)" } });
      const pg = await prisma.priceGroup.upsert({
        where: { kind: PG_KIND }, update: {}, create: { kind: PG_KIND, name: "Standard" },
      });
      // Eltern-Wurzeln (Slice 2) für beide Mandanten, damit die Kinder FK-gültig sind.
      await prisma.company.create({ data: { id: CO, name: "RLS3 Kunde", priceGroupId: pg.id, tenantId: "tenant_texma" } });
      await prisma.supplier.create({ data: { id: SUP, name: "RLS3 Lieferant", tenantId: "tenant_texma" } });
      await prisma.article.create({ data: { id: ART, sku: "RLS3-ART", name: "RLS3", description: "x", ekCents: 100, vkCents: 200, tenantId: "tenant_texma" } });
      // Variante ist selbst ein Kind (Slice 3) → tenantId je Mandant.
      await prisma.variant.create({ data: { id: VAR_A, articleId: ART, sku: "RLS3-A", tenantId: "tenant_texma" } });
      await prisma.variant.create({ data: { id: VAR_B, articleId: ART, sku: "RLS3-B", tenantId: T_B } });

      // ── Belege-Kinder je Mandant: Order(+Line), PurchaseOrder(+Line), StockMove ──
      await prisma.order.create({ data: { id: ORDER_A, number: "RLS3-OA", companyId: CO, tenantId: "tenant_texma" } });
      await prisma.order.create({ data: { id: ORDER_B, number: "RLS3-OB", companyId: CO, tenantId: T_B } });
      await prisma.orderLine.create({ data: { id: OL_A, orderId: ORDER_A, position: 1, description: "A", qty: 1, unitNetCents: 100, tenantId: "tenant_texma" } });
      await prisma.orderLine.create({ data: { id: OL_B, orderId: ORDER_B, position: 1, description: "B", qty: 1, unitNetCents: 100, tenantId: T_B } });

      await prisma.purchaseOrder.create({ data: { id: PO_A, number: "RLS3-PA", supplierId: SUP, tenantId: "tenant_texma" } });
      await prisma.purchaseOrder.create({ data: { id: PO_B, number: "RLS3-PB", supplierId: SUP, tenantId: T_B } });
      await prisma.purchaseOrderLine.create({ data: { id: POL_A, purchaseOrderId: PO_A, variantId: VAR_A, qty: 5, ekCents: 100, tenantId: "tenant_texma" } });
      await prisma.purchaseOrderLine.create({ data: { id: POL_B, purchaseOrderId: PO_B, variantId: VAR_B, qty: 5, ekCents: 100, tenantId: T_B } });

      await prisma.stockMove.create({ data: { id: SM_A, variantId: VAR_A, deltaQty: 5, grund: "WARENEINGANG", tenantId: "tenant_texma" } });
      await prisma.stockMove.create({ data: { id: SM_B, variantId: VAR_B, deltaQty: 5, grund: "WARENEINGANG", tenantId: T_B } });
    });

    afterAll(async () => {
      await cleanup();
      await appDb.$disconnect();
      await prisma.$disconnect();
    });

    it("a) Kontext tenant_texma sieht nur eigene Kinder (OrderLine/PO-Line/StockMove)", async () => {
      const [, ol, pol, sm] = await appDb.$transaction([
        setTenant("tenant_texma"),
        appDb.orderLine.findMany({ where: { id: { in: [OL_A, OL_B] } }, select: { id: true } }),
        appDb.purchaseOrderLine.findMany({ where: { id: { in: [POL_A, POL_B] } }, select: { id: true } }),
        appDb.stockMove.findMany({ where: { id: { in: [SM_A, SM_B] } }, select: { id: true } }),
      ]);
      expect(ol.map((r) => r.id)).toEqual([OL_A]);
      expect(pol.map((r) => r.id)).toEqual([POL_A]);
      expect(sm.map((r) => r.id)).toEqual([SM_A]);
    });

    it("b) Kontext tenant_b sieht nur eigene Kinder", async () => {
      const [, ol, pol, sm] = await appDb.$transaction([
        setTenant(T_B),
        appDb.orderLine.findMany({ where: { id: { in: [OL_A, OL_B] } }, select: { id: true } }),
        appDb.purchaseOrderLine.findMany({ where: { id: { in: [POL_A, POL_B] } }, select: { id: true } }),
        appDb.stockMove.findMany({ where: { id: { in: [SM_A, SM_B] } }, select: { id: true } }),
      ]);
      expect(ol.map((r) => r.id)).toEqual([OL_B]);
      expect(pol.map((r) => r.id)).toEqual([POL_B]);
      expect(sm.map((r) => r.id)).toEqual([SM_B]);
    });

    it("c) ohne Tenant-Kontext: 0 Kind-Zeilen (fail-closed)", async () => {
      expect(await appDb.orderLine.count()).toBe(0);
      expect(await appDb.stockMove.count()).toBe(0);
      expect(await appDb.purchaseOrderLine.count()).toBe(0);
    });

    it("d) INSERT eines Kindes mit fremder tenantId wird von WITH CHECK abgelehnt", async () => {
      await expect(
        appDb.$transaction([
          setTenant(T_B),
          appDb.stockMove.create({ data: { id: "sm_rls3_evil", variantId: VAR_B, deltaQty: 1, grund: "KORREKTUR", tenantId: "tenant_texma" } }),
        ])
      ).rejects.toThrow(/row-level security/i);
      expect(await prisma.stockMove.count({ where: { id: "sm_rls3_evil" } })).toBe(0);
    });

    it("e) EXPLAIN zeigt InitPlan — current_setting einmal pro Query (F12)", async () => {
      const [, plan] = await appDb.$transaction([
        setTenant("tenant_texma"),
        appDb.$queryRaw<Array<{ "QUERY PLAN": string }>>`EXPLAIN SELECT * FROM "OrderLine"`,
      ]);
      expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toMatch(/InitPlan/);
    });

    it("f) PriceGroup ist global/exempt — ohne Tenant-Kontext sichtbar (kein RLS)", async () => {
      // Kein set_config → ein tenant-scoped Kind liefert 0, PriceGroup bleibt sichtbar.
      expect(await appDb.priceGroup.count()).toBeGreaterThan(0);
      expect(await appDb.orderLine.count()).toBe(0);
    });
  });
}
