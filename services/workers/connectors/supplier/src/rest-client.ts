// Generischer REST-Katalog-Client (Kap. 3/13, C3). Pollt eine paginierende REST-
// Liste per Delta-Sync und akkumuliert die rohen Items; das Mapping je Lieferant
// passiert danach (mapSupplierCatalog). Auth wahlweise HTTP Basic (key:secret) oder
// Bearer-Token. Pagination über einen Total-Pages-Header (wie WooCommerce). Robuste
// Orchestrierung (Retry/Backoff/Rate-Limit, Outbox) ist bewusst Block C2.

import type { SupplierCatalogClient } from "./index.js";

export type SupplierAuth =
  | { scheme: "basic"; consumerKey: string; consumerSecret: string }
  | { scheme: "bearer"; token: string };

export interface RestSupplierCatalogClientOptions {
  baseUrl: string;
  /** Katalog-Endpunkt je Lieferant, z. B. "/api/v1/catalog". */
  catalogPath: string;
  auth: SupplierAuth;
  /** Injizierbar für Tests; default globales fetch (Node ≥22). */
  fetchImpl?: typeof fetch;
  /** Delta-Query-Parameter, default "modified_after". */
  modifiedParam?: string;
  /** Item-Feld für den nächsten Cursor (ISO-Zeitstempel), default "modifiedAt". */
  cursorField?: string;
  /** Response-Header mit der Gesamtseitenzahl, default "X-Total-Pages". */
  totalPagesHeader?: string;
  pageParam?: string;
  perPageParam?: string;
  pageSize?: number;
  timeoutMs?: number;
}

export class RestSupplierCatalogClient implements SupplierCatalogClient {
  private readonly base: string;
  private readonly path: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;
  private readonly modifiedParam: string;
  private readonly cursorField: string;
  private readonly totalPagesHeader: string;
  private readonly pageParam: string;
  private readonly perPageParam: string;
  private readonly pageSize: number;
  private readonly timeoutMs: number;

  constructor(opts: RestSupplierCatalogClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.path = opts.catalogPath.startsWith("/") ? opts.catalogPath : `/${opts.catalogPath}`;
    this.authHeader =
      opts.auth.scheme === "basic"
        ? "Basic " +
          Buffer.from(`${opts.auth.consumerKey}:${opts.auth.consumerSecret}`).toString("base64")
        : `Bearer ${opts.auth.token}`;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.modifiedParam = opts.modifiedParam ?? "modified_after";
    this.cursorField = opts.cursorField ?? "modifiedAt";
    this.totalPagesHeader = opts.totalPagesHeader ?? "X-Total-Pages";
    this.pageParam = opts.pageParam ?? "page";
    this.perPageParam = opts.perPageParam ?? "per_page";
    this.pageSize = opts.pageSize ?? 100;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async fetchCatalogSince(cursor: string | null): Promise<{ items: unknown[]; nextCursor: string }> {
    const items: unknown[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const url = new URL(`${this.base}${this.path}`);
      url.searchParams.set(this.perPageParam, String(this.pageSize));
      url.searchParams.set(this.pageParam, String(page));
      if (cursor) url.searchParams.set(this.modifiedParam, cursor);

      const res = await this.fetchImpl(url.toString(), {
        headers: { Authorization: this.authHeader, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Lieferanten-Authentifizierung fehlgeschlagen (HTTP ${res.status}) für ${this.base}.`
        );
      }
      if (!res.ok) {
        throw new Error(`Lieferanten-Katalogabruf fehlgeschlagen (HTTP ${res.status}) für ${url.pathname}.`);
      }

      const batch = (await res.json()) as unknown[];
      items.push(...batch);

      const headerPages = Number(res.headers.get(this.totalPagesHeader));
      totalPages = Number.isFinite(headerPages) && headerPages > 0 ? headerPages : 1;
      page += 1;
    } while (page <= totalPages);

    return { items, nextCursor: this.computeNextCursor(items, cursor) };
  }

  /** Höchster cursorField-Zeitstempel der geholten Items, sonst alter Cursor / Epoch. */
  private computeNextCursor(items: unknown[], cursor: string | null): string {
    let max = cursor;
    for (const it of items) {
      const modified = (it as Record<string, unknown>)[this.cursorField];
      if (typeof modified === "string" && (!max || modified > max)) max = modified;
    }
    return max ?? new Date(0).toISOString();
  }
}
