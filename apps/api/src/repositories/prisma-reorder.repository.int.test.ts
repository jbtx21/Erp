// Integrationstest gegen ECHTES Postgres (T-12). Eine Variante unterschreitet den
// Mindestbestand → Bestellvorschlag beim Hauptlieferanten; createPurchaseOrders legt
// eine Bestellung mit der Nachbestellmenge an. Distinkter PriceGroup.kind (TOP).
// Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaReorderRepository } from "./prisma-reorder.repository.js";
import { ReorderService } from "../modules/reorder/reorder.service.js";

const PG = "pg_ro";
const CO = "co_ro";
const SUP = "sup_ro";
const ART = "art_ro";
const V_LOW = "var_ro_low";
const V_OK = "var_ro_ok";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaReorderRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaReorderRepository — Mindestbestand-Reorder gegen echtes Postgres", () => {
    const service = new ReorderService(new PrismaReorderRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { supplierId: SUP } } });
      await prisma.purchaseOrder.deleteMany({ where: { supplierId: SUP } });
      await prisma.stockLevel.deleteMany({ where: { variantId: { in: [V_LOW, V_OK] } } });
      await prisma.supplierItem.deleteMany({ where: { supplierId: SUP } });
      await prisma.variant.deleteMany({ where: { id: { in: [V_LOW, V_OK] } } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.supplier.deleteMany({ where: { id: SUP } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "TOP", name: "Top" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.supplier.create({ data: { id: SUP, name: "ID Identity", kind: "ID_IDENTITY" } });
      await prisma.article.create({ data: { description: "Testartikel", ekCents: 0, vkCents: 0, id: ART, sku: "ART-RO", name: "Transferdruck" } });
      await prisma.variant.create({ data: { id: V_LOW, articleId: ART, sku: "RO-LOW" } });
      await prisma.variant.create({ data: { id: V_OK, articleId: ART, sku: "RO-OK" } });
      await prisma.supplierItem.create({ data: { supplierId: SUP, variantId: V_LOW, ekCents: 500, priority: 1 } });
      await prisma.supplierItem.create({ data: { supplierId: SUP, variantId: V_OK, ekCents: 400, priority: 1 } });
      await prisma.stockLevel.create({ data: { variantId: V_LOW, qty: 2, minStock: 10 } }); // → 8
      await prisma.stockLevel.create({ data: { variantId: V_OK, qty: 20, minStock: 5 } }); // ausreichend
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("schlägt nur die unterschrittene Variante vor und legt eine Bestellung an", async () => {
      const groups = await service.proposals();
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ supplierId: SUP });
      expect(groups[0]?.lines).toEqual([
        { variantId: V_LOW, supplierId: SUP, orderQty: 8, ekCents: 500 },
      ]);

      const created = await service.createPurchaseOrders();
      expect(created).toHaveLength(1);
      const line = await prisma.purchaseOrderLine.findFirst({ where: { purchaseOrderId: created[0]!.purchaseOrderId } });
      expect(line).toMatchObject({ variantId: V_LOW, qty: 8, ekCents: 500 });
    });
  });
}
