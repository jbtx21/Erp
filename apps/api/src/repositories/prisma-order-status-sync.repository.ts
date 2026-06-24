// Prisma-Implementierung der Auftragsstatus-Rückmeldung (Kap. 4.2). Lädt die für
// die Rückmeldung nötigen Felder (Shop-Herkunft, Tracking/Carrier, Kunden-E-Mail aus
// dem ersten Kontakt) und reiht den Shop-Push als Outbox-Event ein (Relay → Worker).

import { prisma } from "@texma/db";
import type { Carrier, OrderStatus } from "@texma/shared";
import type { OrderStatusSyncRepository, OrderSyncInfo } from "../modules/order-status-sync/order-status-sync.service.js";

export class PrismaOrderStatusSyncRepository implements OrderStatusSyncRepository {
  async loadSyncInfo(orderId: string): Promise<OrderSyncInfo | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        number: true,
        shopConnectorId: true,
        externalNumber: true,
        trackingNumber: true,
        carrier: true,
        company: { select: { name: true, contacts: { where: { email: { not: null } }, select: { email: true }, take: 1 } } },
        shopConnector: { select: { pushStatuses: true } },
      },
    });
    if (!o) return null;
    return {
      orderId: o.id,
      number: o.number,
      shopConnectorId: o.shopConnectorId,
      externalNumber: o.externalNumber,
      trackingNumber: o.trackingNumber,
      carrier: o.carrier as Carrier | null,
      customerEmail: o.company.contacts[0]?.email ?? null,
      customerName: o.company.name,
      pushStatuses: (o.shopConnector?.pushStatuses ?? []) as OrderStatus[],
    };
  }

  async enqueueShopStatusUpdate(input: {
    orderId: string;
    shopConnectorId: string;
    externalNumber: string;
    status: OrderStatus;
    trackingNumber: string | null;
    carrier: Carrier | null;
  }): Promise<void> {
    await prisma.outboxEvent.create({
      data: {
        type: "order.status.update",
        aggregateType: "Order",
        aggregateId: input.orderId,
        payload: {
          externalNumber: input.externalNumber,
          shopConnectorId: input.shopConnectorId,
          status: input.status,
          trackingNumber: input.trackingNumber,
          carrier: input.carrier,
        },
      },
    });
  }
}
