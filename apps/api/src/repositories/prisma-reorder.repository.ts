// Prisma-Implementierung des Reorder-Repositories (Produktionspfad, T-12).
// Unterschrittene Bestände: StockLevel mit minStock > 0 und qty < minStock (Spalten-
// vergleich in JS), je Variante der Hauptlieferant (SupplierItem priority 1). Aus dem
// gebündelten Vorschlag wird je Lieferant eine Bestellung (status BESTELLT) erzeugt.

import { prisma } from "@texma/db";
import type { ReorderCandidate, SupplierReorder } from "@texma/shared";
import type {
  CreatedReorderPo,
  ReorderRepository,
} from "../modules/reorder/reorder.service.js";

export class PrismaReorderRepository implements ReorderRepository {
  async belowMinStock(): Promise<ReorderCandidate[]> {
    const stocks = await prisma.stockLevel.findMany({
      where: { minStock: { gt: 0 } },
      select: { variantId: true, qty: true, minStock: true },
    });
    const below = stocks.filter((s) => s.qty < s.minStock);
    if (below.length === 0) return [];

    const suppliers = await prisma.supplierItem.findMany({
      where: { variantId: { in: below.map((s) => s.variantId) }, priority: 1 },
      select: { variantId: true, supplierId: true, ekCents: true },
    });
    const byVariant = new Map(suppliers.map((si) => [si.variantId, si]));

    // Ohne Hauptlieferant kein automatischer Vorschlag (Klärung).
    return below.flatMap((s) => {
      const si = byVariant.get(s.variantId);
      return si
        ? [{ variantId: s.variantId, qty: s.qty, minStock: s.minStock, supplierId: si.supplierId, ekCents: si.ekCents }]
        : [];
    });
  }

  async createPurchaseOrders(groups: SupplierReorder[]): Promise<CreatedReorderPo[]> {
    return prisma.$transaction(async (tx) => {
      const out: CreatedReorderPo[] = [];
      for (const g of groups) {
        const number = `BV-${Date.now()}-${g.supplierId.slice(0, 6)}`;
        const po = await tx.purchaseOrder.create({
          data: {
            number,
            supplierId: g.supplierId,
            status: "BESTELLT",
            lines: { create: g.lines.map((l) => ({ variantId: l.variantId, qty: l.orderQty, ekCents: l.ekCents })) },
          },
          select: { id: true, number: true },
        });
        out.push({ supplierId: g.supplierId, purchaseOrderId: po.id, number: po.number, lineCount: g.lines.length });
      }
      return out;
    });
  }
}
