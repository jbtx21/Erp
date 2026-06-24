// Prisma-Implementierung des Beschaffungs-Repositories (Produktionspfad, T-05).
// Bedarf = Bestellpositionen der PA-Bestellungen (Lieferant = PurchaseOrder.supplier);
// Wareneingang = Wareneingangspositionen derselben Bestellungen.

import { prisma } from "@texma/db";
import type { GoodsReceiptLine, RequiredComponent } from "@texma/shared";
import type { ProcurementRepository, ProductionRef } from "../modules/procurement/procurement.service.js";

export class PrismaProcurementRepository implements ProcurementRepository {
  async listProductions(): Promise<ProductionRef[]> {
    const rows = await prisma.productionOrder.findMany({
      orderBy: { number: "desc" },
      select: { id: true, number: true, order: { select: { number: true } } },
    });
    return rows.map((p) => ({ id: p.id, number: p.number, orderNumber: p.order?.number ?? null }));
  }

  async productionForOrder(orderId: string): Promise<{ id: string } | null> {
    return prisma.productionOrder.findUnique({ where: { orderId }, select: { id: true } });
  }

  async requiredComponents(productionId: string): Promise<RequiredComponent[]> {
    const lines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { productionId } },
      select: { variantId: true, qty: true, purchaseOrder: { select: { supplierId: true } } },
    });
    return lines.map((l) => ({ variantId: l.variantId, supplierId: l.purchaseOrder.supplierId, qty: l.qty }));
  }

  async receivedComponents(productionId: string): Promise<GoodsReceiptLine[]> {
    const lines = await prisma.goodsReceiptLine.findMany({
      where: { goodsReceipt: { purchaseOrder: { productionId } } },
      select: {
        variantId: true,
        receivedQty: true,
        goodsReceipt: { select: { purchaseOrder: { select: { supplierId: true } } } },
      },
    });
    return lines.map((l) => ({
      variantId: l.variantId,
      supplierId: l.goodsReceipt.purchaseOrder.supplierId,
      receivedQty: l.receivedQty,
    }));
  }
}
