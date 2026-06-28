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

  async componentRefs(productionId: string): Promise<Array<{ variantId: string; label: string; supplierName: string }>> {
    // Lesbare Bezeichnungen je Komponente (Artikelname + Varianten-SKU, Lieferantenname)
    // statt der rohen cuid in der Anzeige (Bucket A).
    const lines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { productionId } },
      select: {
        variantId: true,
        variant: { select: { sku: true, article: { select: { name: true } } } },
        purchaseOrder: { select: { supplier: { select: { name: true } } } },
      },
    });
    // Eine Variante kann mehrfach (mehrere POs) vorkommen — pro Variante genügt ein Ref.
    const byVariant = new Map<string, { variantId: string; label: string; supplierName: string }>();
    for (const l of lines) {
      if (byVariant.has(l.variantId)) continue;
      byVariant.set(l.variantId, {
        variantId: l.variantId,
        label: `${l.variant.article.name} (${l.variant.sku})`,
        supplierName: l.purchaseOrder.supplier.name,
      });
    }
    return [...byVariant.values()];
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
