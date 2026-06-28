// Prisma-Wareneingang-Repository (Kap. 6.3 / T-05): offene Bestellungen mit Positionen
// und bereits gebuchter Eingangsmenge; Anlage des Wareneingangsbelegs + Statusfortschreibung
// in einer Transaktion.

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
        lines: { select: { variantId: true, qty: true, ekCents: true, variant: { select: { sku: true, article: { select: { name: true } } } } } },
        goodsReceipts: { select: { lines: { select: { variantId: true, receivedQty: true } } } },
      },
    });
    return pos.map((p) => {
      const recv = receivedByVariant(p.goodsReceipts);
      return {
        id: p.id, number: p.number, supplierName: p.supplier.name, status: p.status as PurchaseOrderStatus, productionId: p.productionId,
        lines: p.lines.map((l) => ({
          variantId: l.variantId,
          label: `${l.variant.article.name} (${l.variant.sku})`,
          orderedQty: l.qty,
          receivedQty: recv.get(l.variantId) ?? 0,
          ekCents: l.ekCents,
        })),
      };
    });
  }

  async purchaseOrderLines(purchaseOrderId: string): Promise<Array<{ variantId: string; orderedQty: number; receivedQty: number; ekCents: number }>> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: {
        lines: { select: { variantId: true, qty: true, ekCents: true } },
        goodsReceipts: { select: { lines: { select: { variantId: true, receivedQty: true } } } },
      },
    });
    if (!po) return [];
    const recv = receivedByVariant(po.goodsReceipts);
    return po.lines.map((l) => ({ variantId: l.variantId, orderedQty: l.qty, receivedQty: recv.get(l.variantId) ?? 0, ekCents: l.ekCents }));
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
      // wird beim Empfang real sichtbar (kein „blindes" Lager mehr).
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
}
