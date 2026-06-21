// Outbox-Handler `order.status.update` (T-06/T-09): schreibt Auftragsstatus +
// Trackingnummer an den Shop zurück. Reine Routing-/Mapping-Logik mit injizierter
// Shop-Anbindung → ohne DB/HTTP testbar. Tracking erscheint (via buildShopStatusUpdate)
// nur bei VERSENDET.

import { buildShopStatusUpdate, type OrderStatus, type WooStatus } from "@texma/shared";
import type { OutboxHandler } from "@texma/orchestration";

export interface OrderStatusPayload {
  externalNumber: string | null;
  shopConnectorId: string | null;
  status: OrderStatus;
  trackingNumber?: string | null;
}

/** Minimaler Schreibzugriff auf den Shop (von WooRestClient erfüllt). */
export interface ShopWriter {
  updateOrderStatus(externalNumber: string, status: WooStatus, trackingNumber?: string): Promise<void>;
}

export interface OrderStatusHandlerDeps {
  /** Baut den Shop-Schreibclient für die Connector-Id (Credentials entschlüsselt). */
  resolveShopWriter(shopConnectorId: string): Promise<ShopWriter>;
}

export function createOrderStatusUpdateHandler(deps: OrderStatusHandlerDeps): OutboxHandler {
  return async (record) => {
    const p = record.payload as OrderStatusPayload;
    // Manuelle Aufträge ohne Shop-Herkunft brauchen keinen Push.
    if (!p.externalNumber || !p.shopConnectorId) return;

    const update = buildShopStatusUpdate({
      externalOrderNumber: p.externalNumber,
      status: p.status,
      trackingNumber: p.trackingNumber,
    });
    const writer = await deps.resolveShopWriter(p.shopConnectorId);
    await writer.updateOrderStatus(update.externalOrderNumber, update.status, update.trackingNumber);
  };
}
