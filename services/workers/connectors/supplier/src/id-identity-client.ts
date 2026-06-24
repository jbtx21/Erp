// ID Identity (id.dk) — Katalog-Client (Kap. 6, C3). Bezieht den täglichen JSON-
// Vollfeed (eine Zeile je Variante, ProductFields.ItemId/EAN13Code/StockLevel/Prices).
// Da es ein Vollfeed ist (täglich 06:00), gibt es kein Delta — der Cursor wird ignoriert.
// Das Mapping auf das kanonische Katalog-Item passiert danach (mapSupplierCatalog,
// SupplierKind "ID_IDENTITY"). Optional steht für Live-Bestände die REST-API bereit.

import type { SupplierCatalogClient } from "./index.js";

/** Täglicher Produkt-Feed je Sprache/Währung (Doku). Default Deutsch/EUR. */
export const ID_IDENTITY_FEEDS = {
  de_DE: "https://id.dk/Files/Files/Feeds/products-de-de.json",
  en_GB: "https://id.dk/Files/Files/Feeds/products-en-gb.json",
  nl_NL: "https://id.dk/Files/Files/Feeds/products-nl-nl.json",
} as const;

export interface IdIdentityFeedClientOptions {
  /** Feed-URL; default Deutsch/EUR. */
  feedUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class IdIdentityFeedClient implements SupplierCatalogClient {
  private readonly feedUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: IdIdentityFeedClientOptions = {}) {
    this.feedUrl = opts.feedUrl ?? ID_IDENTITY_FEEDS.de_DE;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async fetchCatalogSince(_cursor: string | null): Promise<{ items: unknown[]; nextCursor: string }> {
    const res = await this.fetchImpl(this.feedUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`ID-Identity-Feed-Abruf fehlgeschlagen (HTTP ${res.status}) für ${this.feedUrl}.`);
    }
    const data: unknown = await res.json();
    // Der Feed ist entweder ein Array oder ein Objekt mit einer Produktliste (defensiv).
    const items = Array.isArray(data)
      ? data
      : Array.isArray((data as { Products?: unknown[] }).Products)
        ? (data as { Products: unknown[] }).Products
        : [];
    return { items, nextCursor: "full" };
  }
}
