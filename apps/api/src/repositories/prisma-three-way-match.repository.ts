// Prisma-Implementierung des 3-Way-Match-Repositories (Produktionspfad, Kap. 9.6).
// Bestell-Aggregat = Summe der Bestellpositionen (mengen­gewichteter Stückpreis) der
// verknüpften PO; Wareneingang = Summe der GoodsReceiptLines derselben PO.

import { prisma } from "@texma/db";
import { roundCents } from "@texma/shared";
import type {
  PoAggregate,
  ThreeWayMatchRepository,
} from "../modules/three-way-match/three-way-match.service.js";

export class PrismaThreeWayMatchRepository implements ThreeWayMatchRepository {
  async poAggregateForInvoice(incomingInvoiceId: string): Promise<PoAggregate | null> {
    const inv = await prisma.incomingInvoice.findUnique({
      where: { id: incomingInvoiceId },
      select: { purchaseOrderId: true },
    });
    if (!inv?.purchaseOrderId) return null;
    const poId = inv.purchaseOrderId;

    const [lines, receiptLines] = await Promise.all([
      prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: poId }, select: { qty: true, ekCents: true } }),
      prisma.goodsReceiptLine.findMany({
        where: { goodsReceipt: { purchaseOrderId: poId } },
        select: { receivedQty: true },
      }),
    ]);

    const poQty = lines.reduce((s, l) => s + l.qty, 0);
    const poValue = lines.reduce((s, l) => s + l.qty * l.ekCents, 0);
    const poUnitCents = poQty > 0 ? roundCents(poValue / poQty) : 0;
    const receivedQty = receiptLines.reduce((s, r) => s + r.receivedQty, 0);

    return { poQty, poUnitCents, receivedQty };
  }

  async setStatus(incomingInvoiceId: string, status: "GEPRUEFT" | "GESPERRT"): Promise<void> {
    await prisma.incomingInvoice.update({ where: { id: incomingInvoiceId }, data: { status } });
  }
}
