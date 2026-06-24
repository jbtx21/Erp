// Stanley/Stella — Katalog-Client (Kap. 6, C3). Spricht die JSON-RPC-API von
// api.stanleystella.com: POST mit Payload {jsonrpc, method:"call", params:{db_name,
// user, password, …Filter}}. Die Antwort liefert `result` als JSON-String (oder ein
// `error`-Objekt trotz HTTP 200). Produkt-, Preis- und Stock-API werden getrennt
// gerufen und zu EINEM Roh-Item je Variante zusammengeführt (B2BSKUREF/EAN/ekEur/
// stockQty) — passend zu mapStanleyStellaCatalog. Preis-/Bestands-Feldnamen sind die
// Doku-Lesart und vor Go-Live an einer Postman-Sample-Antwort zu verifizieren.

import type { SupplierCatalogClient } from "./index.js";

export interface StanleyStellaClientOptions {
  user: string;
  password: string;
  /** Datenbankname laut Doku; default "production_api". */
  dbName?: string;
  baseUrl?: string;
  languageCode?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Liest aus einem Objekt das erste vorhandene Feld (defensive Feldnamen-Auflösung). */
function pick(obj: unknown, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) if (rec[k] !== undefined && rec[k] !== null) return rec[k];
  return undefined;
}

export class StanleyStellaClient implements SupplierCatalogClient {
  private readonly base: string;
  private readonly user: string;
  private readonly password: string;
  private readonly dbName: string;
  private readonly lang: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: StanleyStellaClientOptions) {
    this.base = (opts.baseUrl ?? "https://api.stanleystella.com").replace(/\/+$/, "");
    this.user = opts.user;
    this.password = opts.password;
    this.dbName = opts.dbName ?? "production_api";
    this.lang = opts.languageCode ?? "en_GB";
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  /** Ein JSON-RPC-Aufruf; wirft bei error-Node, parst den `result`-JSON-String. */
  async call(path: string, params: Record<string, unknown>): Promise<unknown[]> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { db_name: this.dbName, user: this.user, password: this.password, ...params },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Stanley/Stella-Abruf fehlgeschlagen (HTTP ${res.status}) für ${path}.`);
    }
    const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) {
      throw new Error(`Stanley/Stella-Fehler für ${path}: ${json.error.message ?? "unbekannt"}`);
    }
    const result = typeof json.result === "string" ? JSON.parse(json.result) : json.result;
    return Array.isArray(result) ? result : [];
  }

  async fetchCatalogSince(_cursor: string | null): Promise<{ items: unknown[]; nextCursor: string }> {
    const [products, prices, stock] = await Promise.all([
      this.call("/webrequest/products/get_json", { LanguageCode: this.lang, Published: true }),
      this.call("/webrequest/products/get_prices", {}),
      this.call("/webrequest/v2/stock/get_json", { Is_Inventory: true }),
    ]);

    const priceBySku = new Map<string, string | number>();
    for (const p of prices) {
      const sku = pick(p, ["B2BSKUREF", "SKU"]);
      const price = pick(p, ["Price", "PurchasePrice", "PriceEUR", "Amount"]);
      if (typeof sku === "string" && (typeof price === "string" || typeof price === "number")) priceBySku.set(sku, price);
    }
    const stockBySku = new Map<string, number>();
    for (const s of stock) {
      const sku = pick(s, ["SKU", "B2BSKUREF"]);
      const qty = pick(s, ["StockLevel", "Quantity", "Stock", "AvailableQuantity"]);
      if (typeof sku === "string" && typeof qty === "number") stockBySku.set(sku, qty);
    }

    const items = products
      .map((p) => {
        const b2b = pick(p, ["B2BSKUREF", "SKU"]);
        const ean = pick(p, ["EAN", "EAN13", "Ean", "EANCode"]);
        if (typeof b2b !== "string") return null;
        return {
          B2BSKUREF: b2b,
          EAN: typeof ean === "string" ? ean : b2b,
          ekEur: priceBySku.get(b2b) ?? 0,
          stockQty: stockBySku.get(b2b) ?? null,
        };
      })
      .filter((x): x is { B2BSKUREF: string; EAN: string; ekEur: string | number; stockQty: number | null } => x !== null);

    return { items, nextCursor: "full" };
  }
}
