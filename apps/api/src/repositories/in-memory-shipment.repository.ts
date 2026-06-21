// In-Memory-Implementierung des Versand-Repositories — für Tests/lokale Durchstiche.
// Hält versandbereite Aufträge und protokolliert die eingereihten Outbox-Events, damit
// Tests den Shop-Rückmeldepfad prüfen können, ohne DB/Queue.

import type {
  ConfirmShippedResult,
  ShipmentRepository,
  ShippableOrder,
} from "../modules/shipment/shipment.service.js";

export interface EnqueuedEvent {
  type: string;
  payload: unknown;
}

export class InMemoryShipmentRepository implements ShipmentRepository {
  readonly outbox: EnqueuedEvent[] = [];

  constructor(private readonly shippable: ShippableOrder[]) {}

  async listShippable(limit: number): Promise<ShippableOrder[]> {
    return this.shippable.slice(0, limit);
  }

  async confirmShipped(input: { orderId: string; trackingNumber: string }): Promise<ConfirmShippedResult> {
    const order = this.shippable.find((o) => o.id === input.orderId);
    const externalNumber = order?.externalNumber ?? null;
    this.outbox.push({
      type: "order.status.update",
      payload: {
        externalNumber,
        shopConnectorId: order?.shopConnectorId ?? null,
        status: "VERSENDET",
        trackingNumber: input.trackingNumber,
      },
    });
    return { orderId: input.orderId, externalNumber, trackingNumber: input.trackingNumber };
  }
}
