// Echter WooCommerce-REST-Client (Kap. 3/13). Pollt Bestellungen per Delta-Sync
// über /wp-json/wc/v3/orders. Auth: HTTP Basic über HTTPS (consumer key:secret).
// Robuste Orchestrierung (Retry/Backoff/Rate-Limit, Outbox) ist bewusst Block C2 —
// hier ein schlanker, paginierender „seit Cursor"-Poll.

import type { Carrier, WooStatus } from "@texma/shared";
import type { WooClient } from "./index.js";

/** Was an die Shop-Bestellung geschrieben wird (Status + optional Tracking/Carrier/Link). */
export interface ShopOrderStatusWrite {
  externalNumber: string;
  status: WooStatus;
  trackingNumber?: string;
  carrier?: Carrier;
  trackingUrl?: string;
}

export interface WooRestClientOptions {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  /** Injizierbar für Tests; default globales fetch (Node ≥22). */
  fetchImpl?: typeof fetch;
  /** WooCommerce erlaubt max. 100. */
  pageSize?: number;
  /** Request-Timeout in ms. */
  timeoutMs?: number;
}

interface WooModified {
  date_modified_gmt?: string | null;
}

export class WooRestClient implements WooClient {
  private readonly base: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly timeoutMs: number;

  constructor(opts: WooRestClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.authHeader =
      "Basic " + Buffer.from(`${opts.consumerKey}:${opts.consumerSecret}`).toString("base64");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.pageSize = opts.pageSize ?? 100;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async fetchOrdersSince(cursor: string | null): Promise<{ orders: unknown[]; nextCursor: string }> {
    const orders: unknown[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const url = new URL(`${this.base}/wp-json/wc/v3/orders`);
      url.searchParams.set("orderby", "modified");
      url.searchParams.set("order", "asc");
      url.searchParams.set("dates_are_gmt", "true");
      url.searchParams.set("per_page", String(this.pageSize));
      url.searchParams.set("page", String(page));
      if (cursor) url.searchParams.set("modified_after", cursor);

      const res = await this.fetchImpl(url.toString(), {
        headers: { Authorization: this.authHeader, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(`WooCommerce-Authentifizierung fehlgeschlagen (HTTP ${res.status}) für ${this.base}.`);
      }
      if (!res.ok) {
        throw new Error(`WooCommerce-Abruf fehlgeschlagen (HTTP ${res.status}) für ${url.pathname}.`);
      }

      const batch = (await res.json()) as unknown[];
      orders.push(...batch);

      const headerPages = Number(res.headers.get("X-WP-TotalPages"));
      totalPages = Number.isFinite(headerPages) && headerPages > 0 ? headerPages : 1;
      page += 1;
    } while (page <= totalPages);

    return { orders, nextCursor: this.computeNextCursor(orders, cursor) };
  }

  /**
   * Manueller Sofort-Abruf EINER Bestellung über ihre Shop-Bestellnummer (dringende
   * Aufträge, die nicht auf den nächsten Poll warten sollen). Sucht per `search`; liefert
   * die exakt passende Order (number/id) bzw. die erste Treffer-Order oder null.
   */
  async fetchOrderByNumber(externalNumber: string): Promise<unknown | null> {
    const url = new URL(`${this.base}/wp-json/wc/v3/orders`);
    url.searchParams.set("search", externalNumber);
    url.searchParams.set("per_page", "20");
    const res = await this.fetchImpl(url.toString(), {
      headers: { Authorization: this.authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`WooCommerce-Authentifizierung fehlgeschlagen (HTTP ${res.status}) für ${this.base}.`);
    }
    if (!res.ok) throw new Error(`WooCommerce-Abruf fehlgeschlagen (HTTP ${res.status}) für ${url.pathname}.`);
    const batch = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(batch) || batch.length === 0) return null;
    const exact = batch.find((o) => String(o.number ?? o.id) === externalNumber || String(o.id) === externalNumber);
    return exact ?? batch[0] ?? null;
  }

  /**
   * Schreibt Status (+ optional Trackingnummer) an eine Shop-Bestellung zurück
   * (T-06/T-09). PUT /wp-json/wc/v3/orders/{id}; die Trackingnummer wird als
   * Order-Meta (`_dpd_tracking`) gesetzt. `externalNumber` = Shop-Bestell-Id.
   */
  async updateOrderStatus(update: ShopOrderStatusWrite): Promise<void> {
    const { externalNumber, status, trackingNumber, carrier, trackingUrl } = update;
    const url = `${this.base}/wp-json/wc/v3/orders/${encodeURIComponent(externalNumber)}`;
    const body: Record<string, unknown> = { status };
    if (trackingNumber) {
      const meta: Array<{ key: string; value: string }> = [{ key: "_dpd_tracking", value: trackingNumber }];
      if (carrier) meta.push({ key: "_tracking_carrier", value: carrier });
      if (trackingUrl) meta.push({ key: "_tracking_url", value: trackingUrl });
      body.meta_data = meta;
    }
    const res = await this.fetchImpl(url, {
      method: "PUT",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`WooCommerce-Authentifizierung fehlgeschlagen (HTTP ${res.status}) für ${this.base}.`);
    }
    if (!res.ok) {
      throw new Error(`WooCommerce-Status-Update fehlgeschlagen (HTTP ${res.status}) für Order ${externalNumber}.`);
    }
  }

  /** Höchstes date_modified_gmt der geholten Orders (ISO), sonst alter Cursor / Epoch. */
  private computeNextCursor(orders: unknown[], cursor: string | null): string {
    let max = cursor;
    for (const o of orders) {
      const modified = (o as WooModified).date_modified_gmt;
      if (modified && (!max || modified > max)) max = modified;
    }
    return max ?? new Date(0).toISOString();
  }
}
