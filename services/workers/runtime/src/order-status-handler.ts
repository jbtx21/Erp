// Outbox-Handler `order.status.update` (T-06/T-09): schreibt Auftragsstatus +
// Trackingnummer (+ Carrier/Tracking-Link) an den Shop zurück. Reine Routing-/Mapping-
// Logik mit injizierter Shop-Anbindung → ohne DB/HTTP testbar. Tracking erscheint (via
// buildShopStatusUpdate) nur bei VERSENDET. Shop-übergreifend: der Writer wird je
// Connector-Art (WooCommerce/Shopify/…) aufgelöst — manuelle Aufträge ohne Shop werden
// nicht hier behandelt (dort verschickt das ERP direkt die Kunden-Mail).

import { buildShopStatusUpdate, type Carrier, type OrderStatus, type WooStatus } from "@texma/shared";
import type { OutboxHandler } from "@texma/orchestration";

export interface OrderStatusPayload {
  externalNumber: string | null;
  shopConnectorId: string | null;
  status: OrderStatus;
  trackingNumber?: string | null;
  carrier?: Carrier | null;
}

/** Was an den Shop geschrieben wird (kanonischer Status + Tracking/Carrier/Link). */
export interface ShopOrderStatusWrite {
  externalNumber: string;
  status: WooStatus;
  trackingNumber?: string;
  carrier?: Carrier;
  trackingUrl?: string;
}

/** Minimaler Schreibzugriff auf den Shop (von WooRestClient/ShopifyWriter erfüllt). */
export interface ShopWriter {
  updateOrderStatus(update: ShopOrderStatusWrite): Promise<void>;
}

export interface OrderStatusHandlerDeps {
  /** Baut den Shop-Schreibclient für die Connector-Id (Credentials entschlüsselt, Art-spezifisch). */
  resolveShopWriter(shopConnectorId: string): Promise<ShopWriter>;
}

export function createOrderStatusUpdateHandler(deps: OrderStatusHandlerDeps): OutboxHandler {
  return async (record) => {
    const p = record.payload as OrderStatusPayload;
    // Manuelle Aufträge ohne Shop-Herkunft brauchen keinen Push (Kunden-Mail läuft im API-Tier).
    if (!p.externalNumber || !p.shopConnectorId) return;

    const update = buildShopStatusUpdate({
      externalOrderNumber: p.externalNumber,
      status: p.status,
      trackingNumber: p.trackingNumber,
      carrier: p.carrier,
    });
    const writer = await deps.resolveShopWriter(p.shopConnectorId);
    await writer.updateOrderStatus({
      externalNumber: update.externalOrderNumber,
      status: update.status,
      trackingNumber: update.trackingNumber,
      carrier: update.carrier,
      trackingUrl: update.trackingUrl,
    });
  };
}
