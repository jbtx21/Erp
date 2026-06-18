// Integrationstest gegen ECHTES Postgres (T-05). Eine PA wird von zwei Lieferanten
// (FHB + Stanley/Stella) beliefert; der Start ist erst frei, wenn beide vollständig
// im Wareneingang gebucht sind. Distinkter PriceGroup.kind (PREMIUM). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { PrismaProcurementRepository } from "./prisma-procurement.repository.js";
import { ProcurementService } from "../modules/procurement/procurement.service.js";

const PG = "pg_proc";
const CO = "co_proc";
const ART = "art_proc";
const V_FHB = "v_proc_fhb";
const V_SS = "v_proc_ss";
const S_FHB = "sup_proc_fhb";
const S_SS = "sup_proc_ss";
const ORD = "order_proc";
const PA = "pa_proc";
const PO_FHB = "po_proc_fhb";
const PO_SS = "po_proc_ss";
const GR_FHB = "gr_proc_fhb";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaProcurementRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaProcurementRepository — Multi-Lieferant-Gate gegen echtes Postgres", () => {
    const service = new ProcurementService(new PrismaProcurementRepository());

    async function cleanup() {
      await prisma.goodsReceiptLine.deleteMany({ where: { goodsReceipt: { purchaseOrderId: { in: [PO_FHB, PO_SS] } } } });
      await prisma.goodsReceipt.deleteMany({ where: { purchaseOrderId: { in: [PO_FHB, PO_SS] } } });
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: [PO_FHB, PO_SS] } } });
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: [PO_FHB, PO_SS] } } });
      await prisma.productionOrder.deleteMany({ where: { id: PA } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.variant.deleteMany({ where: { id: { in: [V_FHB, V_SS] } } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.supplier.deleteMany({ where: { id: { in: [S_FHB, S_SS] } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "PREMIUM", name: "Premium" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.supplier.create({ data: { id: S_FHB, name: "FHB", kind: "FHB_NEXMART" } });
      await prisma.supplier.create({ data: { id: S_SS, name: "Stanley/Stella", kind: "STANLEY_STELLA" } });
      await prisma.article.create({ data: { id: ART, sku: "ART-PROC", name: "Shirt" } });
      await prisma.variant.create({ data: { id: V_FHB, articleId: ART, sku: "PROC-FHB" } });
      await prisma.variant.create({ data: { id: V_SS, articleId: ART, sku: "PROC-SS" } });
      await prisma.order.create({ data: { id: ORD, number: "AB-PROC-1", companyId: CO } });
      await prisma.productionOrder.create({ data: { id: PA, number: "PA-PROC-1", orderId: ORD } });
      await prisma.purchaseOrder.create({
        data: { id: PO_FHB, number: "BE-FHB-1", supplierId: S_FHB, productionId: PA, lines: { create: { variantId: V_FHB, qty: 10, ekCents: 500 } } },
      });
      await prisma.purchaseOrder.create({
        data: { id: PO_SS, number: "BE-SS-1", supplierId: S_SS, productionId: PA, lines: { create: { variantId: V_SS, qty: 5, ekCents: 400 } } },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("sperrt den Start mit nur einem Wareneingang und gibt ihn nach beiden frei", async () => {
      // Nur FHB eingegangen.
      await prisma.goodsReceipt.create({
        data: { id: GR_FHB, purchaseOrderId: PO_FHB, lines: { create: { variantId: V_FHB, receivedQty: 10 } } },
      });
      const before = await service.productionStartStatus(PA);
      expect(before.canStart).toBe(false);

      // Stanley/Stella nachliefern.
      await prisma.goodsReceipt.create({
        data: { purchaseOrderId: PO_SS, lines: { create: { variantId: V_SS, receivedQty: 5 } } },
      });
      const after = await service.productionStartStatus(PA);
      expect(after.canStart).toBe(true);
    });
  });
}
