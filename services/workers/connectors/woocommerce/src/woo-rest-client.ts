// Echter WooCommerce-REST-Client (Kap. 3/13). Pollt Bestellungen per Delta-Sync
// über /wp-json/wc/v3/orders. Auth: HTTP Basic über HTTPS (consumer key:secret).
// Robuste Orchestrierung (Retry/Backoff/Rate-Limit, Outbox) ist bewusst Block C2 —
// hier ein schlanker, paginierender „seit Cursor"-Poll.

import type { WooClient } from "./index.js";

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
