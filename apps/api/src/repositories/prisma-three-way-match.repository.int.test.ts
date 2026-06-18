// Integrationstest gegen ECHTES Postgres (Kap. 9.6). Eingangsrechnung ist mit einer
// PO (10×500, vollständig geliefert) verknüpft: passende Rechnung → GEPRUEFT, zu teure
// → GESPERRT. Distinkter PriceGroup.kind (TOP). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaThreeWayMatchRepository } from "./prisma-three-way-match.repository.js";
import { ThreeWayMatchService } from "../modules/three-way-match/three-way-match.service.js";

const PG = "pg_twm";
const CO = "co_twm";
const SUP = "sup_twm";
const ART = "art_twm";
const VAR = "var_twm";
const ORD = "order_twm";
const PA = "pa_twm";
const PO = "po_twm";
const GR = "gr_twm";
const INV = "iinv_twm";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaThreeWayMatchRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaThreeWayMatchRepository — 3-Way-Match gegen echtes Postgres", () => {
    const service = new ThreeWayMatchService(new PrismaThreeWayMatchRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.incomingInvoice.deleteMany({ where: { id: INV } });
      await prisma.goodsReceiptLine.deleteMany({ where: { goodsReceiptId: GR } });
      await prisma.goodsReceipt.deleteMany({ where: { id: GR } });
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: PO } });
      await prisma.purchaseOrder.deleteMany({ where: { id: PO } });
      await prisma.productionOrder.deleteMany({ where: { id: PA } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.variant.deleteMany({ where: { id: VAR } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.supplier.deleteMany({ where: { id: SUP } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "TOP", name: "Top" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.supplier.create({ data: { id: SUP, name: "Stofflieferant", kind: "MANUAL" } });
      await prisma.article.create({ data: { id: ART, sku: "ART-TWM", name: "Shirt" } });
      await prisma.variant.create({ data: { id: VAR, articleId: ART, sku: "TWM-1" } });
      await prisma.order.create({ data: { id: ORD, number: "AB-TWM-1", companyId: CO } });
      await prisma.productionOrder.create({ data: { id: PA, number: "PA-TWM-1", orderId: ORD } });
      await prisma.purchaseOrder.create({
        data: { id: PO, number: "BE-TWM-1", supplierId: SUP, productionId: PA, lines: { create: { variantId: VAR, qty: 10, ekCents: 500 } } },
      });
      await prisma.goodsReceipt.create({
        data: { id: GR, purchaseOrderId: PO, lines: { create: { variantId: VAR, receivedQty: 10 } } },
      });
      await prisma.incomingInvoice.create({
        data: { id: INV, number: "ER-TWM-1", supplierId: SUP, purchaseOrderId: PO, netCents: 5000, taxCents: 950, grossCents: 5950 },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("GEPRUEFT bei passender Rechnung, GESPERRT bei Preisabweichung", async () => {
      const ok = await service.verify({ incomingInvoiceId: INV, invoicedQty: 10, invoicedUnitCents: 500 });
      expect(ok.status).toBe("GEPRUEFT");
      expect((await prisma.incomingInvoice.findUnique({ where: { id: INV } }))?.status).toBe("GEPRUEFT");

      const bad = await service.verify({ incomingInvoiceId: INV, invoicedQty: 10, invoicedUnitCents: 650 });
      expect(bad.status).toBe("GESPERRT");
      expect((await prisma.incomingInvoice.findUnique({ where: { id: INV } }))?.status).toBe("GESPERRT");
    });
  });
}
