// Prisma-Implementierung der Mehrfach-Teillieferung.

import { prisma } from "@texma/db";
import type { FulfillmentStatus } from "@texma/shared";
import type {
  DeliveryLineInput,
  DeliveryNoteSummary,
  DeliveryRepository,
  OrderLineDelivery,
} from "../modules/delivery/delivery.service.js";

export class PrismaDeliveryRepository implements DeliveryRepository {
  async orderExists(orderId: string): Promise<boolean> {
    return (await prisma.order.count({ where: { id: orderId } })) > 0;
  }

  async linesWithDelivered(orderId: string): Promise<OrderLineDelivery[]> {
    const lines = await prisma.orderLine.findMany({
      where: { orderId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, description: true, qty: true, deliveryLines: { select: { qty: true } } },
    });
    return lines.map((l) => {
      const deliveredQty = l.deliveryLines.reduce((s, d) => s + d.qty, 0);
      return { orderLineId: l.id, position: l.position, description: l.description, orderedQty: l.qty, deliveredQty, remainingQty: l.qty - deliveredQty };
    });
  }

  async nextNumber(orderId: string): Promise<string> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { number: true } });
    const n = await prisma.deliveryNote.count({ where: { orderId } });
    return `${order?.number ?? "LS"}-L${String(n + 1)}`;
  }

  async createDeliveryNote(orderId: string, number: string, lines: DeliveryLineInput[]): Promise<{ id: string; number: string }> {
    return prisma.$transaction(async (tx) => {
      const note = await tx.deliveryNote.create({
        data: { orderId, number, lines: { create: lines.map((l) => ({ orderLineId: l.orderLineId, qty: l.qty })) } },
        select: { id: true, number: true },
      });
      // Verkettung Lieferung → Lager: jede gelieferte, variantengebundene Position bucht
      // einen Abgang (VERBRAUCH) aus dem Hauptlager — der Bestand bewegt sich jetzt real
      // mit dem Versand (kein „blindes" Lager mehr). Freitext-Positionen ohne Variante
      // lösen keine Bewegung aus.
      const variantByLine = new Map(
        (await tx.orderLine.findMany({ where: { id: { in: lines.map((l) => l.orderLineId) } }, select: { id: true, variantId: true } }))
          .map((l) => [l.id, l.variantId])
      );
      for (const l of lines) {
        const variantId = variantByLine.get(l.orderLineId);
        if (!variantId || l.qty <= 0) continue;
        await tx.stockMove.create({
          data: { variantId, deltaQty: -l.qty, grund: "VERBRAUCH", lager: "HAUPT", warehouseId: "wh_haupt", belegRef: `DeliveryNote:${note.number}` },
        });
        await tx.stockLevel.upsert({
          where: { variantId },
          create: { variantId, qty: -l.qty },
          update: { qty: { decrement: l.qty } },
        });
      }
      return note;
    });
  }

  async setOrderLieferstatus(orderId: string, status: FulfillmentStatus): Promise<void> {
    await prisma.order.update({ where: { id: orderId }, data: { lieferstatus: status as never } });
  }

  async listDeliveryNotes(orderId: string): Promise<DeliveryNoteSummary[]> {
    return prisma.deliveryNote.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      select: { id: true, number: true, createdAt: true, lines: { select: { orderLineId: true, qty: true } } },
    });
  }
}
