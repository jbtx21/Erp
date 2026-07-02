// Prisma-Wareneingang-Repository (Kap. 6.3 / T-05): offene Bestellungen mit Positionen
// und bereits gebuchter Eingangsmenge; Anlage des Wareneingangsbelegs + Statusfortschreibung
// in einer Transaktion. Positionen tragen Varianten-Attribute (Größenlauf-Gruppierung),
// Quell-Aufträge (PurchaseOrderLineSource) und das Unterlieferungs-Flag closedShort.

import { prisma } from "@texma/db";
import type {
  GoodsReceiptRepository,
  OpenPurchaseOrder,
  PurchaseOrderStatus,
} from "../modules/goods-receipt/goods-receipt.service.js";

/** Bisher je Variante eingegangene Menge über alle Wareneingänge einer Bestellung. */
function receivedByVariant(receipts: Array<{ lines: Array<{ variantId: string; receivedQty: number }> }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const gr of receipts) for (const l of gr.lines) map.set(l.variantId, (map.get(l.variantId) ?? 0) + l.receivedQty);
  return map;
}

export class PrismaGoodsReceiptRepository implements GoodsReceiptRepository {
  async listOpenPurchaseOrders(): Promise<OpenPurchaseOrder[]> {
    const pos = await prisma.purchaseOrder.findMany({
      where: { status: { not: "ERHALTEN" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, number: true, status: true, productionId: true,
        supplier: { select: { name: true } },
        lines: {
          select: {
            id: true, variantId: true, qty: true, ekCents: true, closedShort: true,
            variant: { select: { sku: true, article: { select: { name: true } }, attributes: { select: { name: true, value: true } } } },
            sources: { select: { orderId: true, ref: true, qty: true } },
          },
        },
        goodsReceipts: { select: { lines: { select: { variantId: true, receivedQty: true } } } },
      },
    });
    return pos.map((p) => {
      const recv = receivedByVariant(p.goodsReceipts);
      return {
        id: p.id, number: p.number, supplierName: p.supplier.name, status: p.status as PurchaseOrderStatus, productionId: p.productionId,
        lines: p.lines.map((l) => ({
          id: l.id,
          variantId: l.variantId,
          label: `${l.variant.article.name} (${l.variant.sku})`,
          articleName: l.variant.article.name,
          attributes: l.variant.attributes.map((a) => ({ name: a.name, value: a.value })),
          orderedQty: l.qty,
          receivedQty: recv.get(l.variantId) ?? 0,
          ekCents: l.ekCents,
          closedShort: l.closedShort,
          sources: l.sources.map((s) => ({ orderId: s.orderId, ref: s.ref, qty: s.qty })),
        })),
      };
    });
  }

  async purchaseOrderLines(purchaseOrderId: string): Promise<Array<{ id: string; variantId: string; orderedQty: number; receivedQty: number; ekCents: number; closedShort: boolean }>> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: {
        lines: { select: { id: true, variantId: true, qty: true, ekCents: true, closedShort: true } },
        goodsReceipts: { select: { lines: { select: { variantId: true, receivedQty: true } } } },
      },
    });
    if (!po) return [];
    const recv = receivedByVariant(po.goodsReceipts);
    return po.lines.map((l) => ({ id: l.id, variantId: l.variantId, orderedQty: l.qty, receivedQty: recv.get(l.variantId) ?? 0, ekCents: l.ekCents, closedShort: l.closedShort }));
  }

  async recordReceipt(purchaseOrderId: string, lines: Array<{ variantId: string; receivedQty: number; ekCents?: number | null }>, newStatus: PurchaseOrderStatus): Promise<{ goodsReceiptId: string }> {
    return prisma.$transaction(async (tx) => {
      const gr = await tx.goodsReceipt.create({
        data: { purchaseOrderId, lines: { create: lines.map((l) => ({ variantId: l.variantId, receivedQty: l.receivedQty, ekCents: l.ekCents ?? null })) } },
        select: { id: true },
      });
      await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: newStatus } });
      // Verkettung Wareneingang → Lager: jede eingegangene Position bucht einen Zugang
      // (WARENEINGANG) ins Hauptlager und schreibt den Bestands-Cache fort — der Bestand
      // wird beim Empfang real sichtbar (kein „blindes" Lager mehr). Auch Überlieferung
      // wird voll gebucht: physisch ist die Ware da.
      for (const l of lines) {
        if (l.receivedQty <= 0) continue;
        await tx.stockMove.create({
          data: { variantId: l.variantId, deltaQty: l.receivedQty, grund: "WARENEINGANG", lager: "HAUPT", warehouseId: "wh_haupt", belegRef: `GoodsReceipt:${gr.id}` },
        });
        await tx.stockLevel.upsert({
          where: { variantId: l.variantId },
          create: { variantId: l.variantId, qty: l.receivedQty },
          update: { qty: { increment: l.receivedQty } },
        });
      }
      return { goodsReceiptId: gr.id };
    });
  }

  async closeLinesShort(purchaseOrderId: string, lineIds: string[], allClosed: boolean): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderLine.updateMany({
        where: { id: { in: lineIds }, purchaseOrderId },
        data: { closedShort: true },
      });
      // Keine offene Position mehr (voll ODER closedShort) → Bestellung abschließen.
      if (allClosed) {
        await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: "ERHALTEN", closedShortAt: new Date() } });
      }
    });
  }
}
