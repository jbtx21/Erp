// Shopify-Schreibadapter (Kap. 4.2): erfüllt dieselbe ShopWriter-Schnittstelle wie der
// WooCommerce-Client, sodass die Status-/Tracking-Rückmeldung shop-übergreifend läuft.
// Mappt den kanonischen Shop-Status auf Shopify-Aktionen: cancelled → Stornieren,
// completed + Tracking → Fulfillment mit Sendungsdaten, sonst Notiz am Auftrag.
// Schlanker REST-Adapter (Admin API); robuste Orchestrierung liefert der Outbox-Relay.

import { CARRIER_LABEL } from "@texma/shared";
import type { ShopWriter, ShopOrderStatusWrite } from "./order-status-handler.js";

export interface ShopifyWriterOptions {
  /** myshopify.com-Domain, z. B. "texma.myshopify.com". */
  shopDomain: string;
  /** Admin-API-Access-Token (X-Shopify-Access-Token). */
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ShopifyWriter implements ShopWriter {
  private readonly base: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ShopifyWriterOptions) {
    const version = opts.apiVersion ?? "2024-01";
    this.base = `https://${opts.shopDomain.replace(/\/+$/, "")}/admin/api/${version}`;
    this.token = opts.accessToken;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async updateOrderStatus(update: ShopOrderStatusWrite): Promise<void> {
    const id = encodeURIComponent(update.externalNumber);
    if (update.status === "cancelled") {
      await this.call(`/orders/${id}/cancel.json`, "POST", {});
      return;
    }
    if (update.status === "completed" && update.trackingNumber) {
      await this.call(`/orders/${id}/fulfillments.json`, "POST", {
        fulfillment: {
          notify_customer: true,
          tracking_info: {
            number: update.trackingNumber,
            company: update.carrier ? CARRIER_LABEL[update.carrier] : undefined,
            url: update.trackingUrl,
          },
        },
      });
      return;
    }
    // Übrige Status: als Notiz vermerken (Shopify kennt keinen freien Bestellstatus).
    await this.call(`/orders/${id}.json`, "PUT", { order: { id: update.externalNumber, note: `ERP-Status: ${update.status}` } });
  }

  private async call(path: string, method: "POST" | "PUT", body: unknown): Promise<void> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: {
        "X-Shopify-Access-Token": this.token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Shopify-Authentifizierung fehlgeschlagen (HTTP ${res.status}) für ${this.base}.`);
    }
    if (!res.ok) {
      throw new Error(`Shopify-Update fehlgeschlagen (HTTP ${res.status}) für ${path}.`);
    }
  }
}
