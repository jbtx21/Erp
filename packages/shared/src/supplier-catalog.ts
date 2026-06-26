// Lieferanten-Katalog → ERP Mapping (rein, testbar) — Kap. 6, 5.6, 32 (C3).
// Ein generischer Inbound-Connector synchronisiert Produktkatalog + Lagerbestand +
// EK-Preise. Pro Lieferant unterscheidet sich nur das Rohformat; die kleinen Mapper
// hier normalisieren es auf ein kanonisches Item, damit 10→30 Lieferanten ohne
// proportionalen Aufwand angebunden werden (Kap. 3.1/21/32).
//
// Annahme zum Schlüssel: `sku` ist die TEXMA-INTERNE Variant.sku (Hersteller-/
// EAN-basiert), über die der Import die Variante auflöst; `supplierSku` ist die
// Artikelnummer des Lieferanten (nur Nachvollziehbarkeit). Die konkreten Feldnamen
// je Lieferant sind vor Go-Live gegen deren API-Doku zu bestätigen (verzahnt K-18).

import { z } from "zod";
import { eurToCents } from "./money.js";

/** Connector-Arten mit Inbound-Katalog-Support (ID Identity, Stanley/Stella, HAKRO, FHB/nexmart). */
export type SupplierKind =
  | "ID_IDENTITY"
  | "STANLEY_STELLA"
  | "HAKRO"
  | "FHB_NEXMART"
  | "MANUAL";

/** Kanonisches Katalog-Item nach dem Mapping. */
export interface SupplierCatalogItem {
  /** Artikelnummer des Lieferanten (Nachvollziehbarkeit). */
  supplierSku: string;
  /** TEXMA-interne Variant.sku — Schlüssel für die Variantenauflösung. */
  sku: string;
  /** Einkaufspreis in Cent (niemals Float). */
  ekCents: number;
  /** Verfügbarer Lagerbestand beim Lieferanten; null = unbekannt. */
  availableQty: number | null;
  // ── Optionale Anreicherung (C3, Säule C): nur gesetzt, wenn der Mapper sie liefert.
  // Erlaubt dem Import, unbekannte SKUs als Artikel + Variante anzulegen statt zu
  // überspringen. Mapper ohne diese Felder bleiben unverändert (rückwärtskompatibel).
  /** Artikelname (für neu angelegte Hauptartikel). */
  articleName?: string;
  /** Hauptartikelnummer (Matrix-Parent); fehlt → die Variante wird eigener Artikel. */
  parentSku?: string;
  /** Variantenmerkmal Farbe. */
  farbe?: string;
  /** Variantenmerkmal Größe. */
  groesse?: string;
}

export class SupplierCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierCatalogError";
  }
}

const PriceLike = z.union([z.string(), z.number()]);
const QtyLike = z.number().int().nonnegative().nullish();

// ── ID Identity (id.dk) ───────────────────────────────────────────────────────
// Täglicher JSON-Feed (products-de-de.json, EUR). Eine Zeile je Variante. Schlüssel
// laut Doku: ProductFields.ItemId ("0300-001-007" = Style-Farbe-Größe) → supplierSku,
// ProductFields.EAN13Code (eindeutige Varianten-EAN) → interne Variant.sku,
// StockLevel → Bestand, Prices.Price.Price (EUR) → EK. Die verschachtelten Preis-/
// Bestandspfade sind die Doku-Lesart und vor Go-Live an einer Sample-Antwort zu prüfen.
const IdIdentitySchema = z.object({
  StockLevel: QtyLike,
  ProductFields: z.object({
    ItemId: z.string().min(1),
    EAN13Code: z.string().min(1),
  }),
  Prices: z.object({ Price: z.object({ Price: PriceLike }) }),
});

export function mapIdIdentityCatalog(raw: unknown): SupplierCatalogItem {
  const r = parse(IdIdentitySchema, raw, "ID Identity");
  return {
    supplierSku: r.ProductFields.ItemId,
    sku: r.ProductFields.EAN13Code,
    ekCents: eurToCents(r.Prices.Price.Price),
    availableQty: r.StockLevel ?? null,
  };
}

// ── Stanley/Stella ───────────────────────────────────────────────────────────
// Die S/S-Produkt-API liefert Preis/Bestand nur veraltet — der Connector ruft Produkt-,
// Preis- und Stock-API getrennt und führt sie zu EINEM Roh-Item zusammen (siehe
// stanleystella-client). Kanonische Schlüssel laut Doku: B2BSKUREF (SKU) → supplierSku,
// EAN → interne Variant.sku, EK in Euro aus der Preis-API, Bestand aus der Stock-API.
const StanleyStellaSchema = z.object({
  B2BSKUREF: z.string().min(1), // S/S-SKU → supplierSku
  EAN: z.string().min(1), // EAN = interne Variant.sku
  ekEur: PriceLike, // EK in Euro (aus get_prices, zusammengeführt)
  stockQty: QtyLike, // Bestand (aus stock/get_json, zusammengeführt)
});

export function mapStanleyStellaCatalog(raw: unknown): SupplierCatalogItem {
  const r = parse(StanleyStellaSchema, raw, "Stanley/Stella");
  return {
    supplierSku: r.B2BSKUREF,
    sku: r.EAN,
    ekCents: eurToCents(r.ekEur),
    availableQty: r.stockQty ?? null,
  };
}

// ── HAKRO ─────────────────────────────────────────────────────────────────────
// Katalog mit deutschen Feldnamen; EK als Euro-String mit Dezimalkomma, Bestand.
const HakroSchema = z.object({
  artikelNummer: z.string().min(1), // HAKRO-Artikelnummer → supplierSku
  herstellerSku: z.string().min(1), // Hersteller-SKU = interne Variant.sku
  einkaufspreis: PriceLike, // EK in Euro (Komma erlaubt)
  bestand: QtyLike,
});

export function mapHakroCatalog(raw: unknown): SupplierCatalogItem {
  const r = parse(HakroSchema, raw, "HAKRO");
  return {
    supplierSku: r.artikelNummer,
    sku: r.herstellerSku,
    ekCents: eurToCents(r.einkaufspreis),
    availableQty: r.bestand ?? null,
  };
}

// ── FHB / nexmart ─────────────────────────────────────────────────────────────
// Inbound-Katalog über die nexmart-Produktdaten (BMEcat-nah: SUPPLIER_AID/BUYER_AID).
// Nur Katalog/Lager/EK; die Bestell-Übermittlung (EDI) bleibt späteren Blöcken.
const FhbNexmartSchema = z.object({
  supplierAID: z.string().min(1), // Lieferanten-Artikel-ID → supplierSku
  buyerAID: z.string().min(1), // Artikelnummer des Käufers = interne Variant.sku
  priceAmount: PriceLike, // EK in Euro
  stock: z.object({ quantity: QtyLike }).nullish(),
});

export function mapFhbNexmartCatalog(raw: unknown): SupplierCatalogItem {
  const r = parse(FhbNexmartSchema, raw, "FHB/nexmart");
  return {
    supplierSku: r.supplierAID,
    sku: r.buyerAID,
    ekCents: eurToCents(r.priceAmount),
    availableQty: r.stock?.quantity ?? null,
  };
}

/** Mapper-Dispatch nach Connector-Art. */
const MAPPERS: Partial<Record<SupplierKind, (raw: unknown) => SupplierCatalogItem>> = {
  ID_IDENTITY: mapIdIdentityCatalog,
  STANLEY_STELLA: mapStanleyStellaCatalog,
  HAKRO: mapHakroCatalog,
  FHB_NEXMART: mapFhbNexmartCatalog,
};

/** Mappt ein einzelnes Roh-Item gemäß Connector-Art auf das kanonische Format. */
export function mapSupplierCatalogItem(raw: unknown, kind: SupplierKind): SupplierCatalogItem {
  const mapper = MAPPERS[kind];
  if (!mapper) {
    throw new SupplierCatalogError(`Kein Katalog-Mapper für Lieferant "${kind}" (C3).`);
  }
  return mapper(raw);
}

/** Mappt eine Liste roher Items; verteilt nach Connector-Art (Phase-1-Lieferanten). */
export function mapSupplierCatalog(raw: unknown[], kind: SupplierKind): SupplierCatalogItem[] {
  return raw.map((item) => mapSupplierCatalogItem(item, kind));
}

function parse<T>(schema: z.ZodType<T>, raw: unknown, label: string): T {
  const res = schema.safeParse(raw);
  if (!res.success) {
    throw new SupplierCatalogError(`Ungültiges ${label}-Katalog-Item: ${res.error.message}`);
  }
  return res.data;
}
