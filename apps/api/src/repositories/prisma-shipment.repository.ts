// Prisma-Implementierung des Versand-Repositories (Produktionspfad, C4).
// `listShippable` liefert versandbereite Aufträge MIT Lieferadresse (Empfänger =
// Firmenname + Lieferadresse). `confirmShipped` setzt in EINER Transaktion Status
// VERSENDET + Trackingnummer und reiht das Outbox-Event `order.status.update` ein.

import { prisma } from "@texma/db";
import type { Carrier } from "@texma/shared";
import type {
  ConfirmShippedResult,
  ShipmentRepository,
  ShippableOrder,
} from "../modules/shipment/shipment.service.js";

// Versandgewicht ist (noch) nicht am Auftrag modelliert — fester Default fürs Label.
const DEFAULT_WEIGHT_GRAMS = 1000;

export class PrismaShipmentRepository implements ShipmentRepository {
  async listShippable(limit: number): Promise<ShippableOrder[]> {
    const rows = await prisma.order.findMany({
      where: { status: "VERSANDBEREIT", deliveryAddressId: { not: null } },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        number: true,
        externalNumber: true,
        shopConnectorId: true,
        company: { select: { name: true } },
        deliveryAddress: { select: { street: true, zip: true, city: true, country: true } },
      },
    });
    return rows
      .filter((r) => r.deliveryAddress)
      .map((r) => ({
        id: r.id,
        number: r.number,
        externalNumber: r.externalNumber,
        shopConnectorId: r.shopConnectorId,
        recipient: {
          name: r.company.name,
          street: r.deliveryAddress!.street,
          zip: r.deliveryAddress!.zip,
          city: r.deliveryAddress!.city,
          country: r.deliveryAddress!.country,
        },
        weightGrams: DEFAULT_WEIGHT_GRAMS,
      }));
  }

  async confirmShipped(input: { orderId: string; trackingNumber: string; carrier?: Carrier }): Promise<ConfirmShippedResult> {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: input.orderId },
        data: { status: "VERSENDET", trackingNumber: input.trackingNumber, ...(input.carrier ? { carrier: input.carrier } : {}) },
        select: { id: true, externalNumber: true, shopConnectorId: true },
      });
      await tx.outboxEvent.create({
        data: {
          type: "order.status.update",
          aggregateType: "Order",
          aggregateId: order.id,
          payload: {
            externalNumber: order.externalNumber,
            shopConnectorId: order.shopConnectorId,
            status: "VERSENDET",
            trackingNumber: input.trackingNumber,
            carrier: input.carrier ?? null,
          },
        },
      });
      return { orderId: order.id, externalNumber: order.externalNumber, trackingNumber: input.trackingNumber };
    });
  }
}
