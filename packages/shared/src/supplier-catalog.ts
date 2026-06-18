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

/** Connector-Arten mit Inbound-Katalog-Support (Phase 1: ID Identity, Stanley/Stella). */
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
}

export class SupplierCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierCatalogError";
  }
}

const PriceLike = z.union([z.string(), z.number()]);
const QtyLike = z.number().int().nonnegative().nullish();

// ── ID Identity ──────────────────────────────────────────────────────────────
// REST-Katalog: Lieferanten-Artikelnummer + Hersteller-SKU, EK in Euro, Bestand.
const IdIdentitySchema = z.object({
  articleNumber: z.string().min(1), // Lieferanten-Artikelnummer → supplierSku
  manufacturerSku: z.string().min(1), // Hersteller-SKU = interne Variant.sku
  purchasePriceEur: PriceLike, // EK in Euro
  stock: QtyLike,
});

export function mapIdIdentityCatalog(raw: unknown): SupplierCatalogItem {
  const r = parse(IdIdentitySchema, raw, "ID Identity");
  return {
    supplierSku: r.articleNumber,
    sku: r.manufacturerSku,
    ekCents: eurToCents(r.purchasePriceEur),
    availableQty: r.stock ?? null,
  };
}

// ── Stanley/Stella ───────────────────────────────────────────────────────────
// Feed: Varianten-Code (S/S) + EAN, B2B-Preis in Euro, verfügbare Menge.
const StanleyStellaSchema = z.object({
  variantCode: z.string().min(1), // S/S-Variantencode → supplierSku
  ean: z.string().min(1), // EAN = interne Variant.sku
  prices: z.object({ wholesale: PriceLike }),
  availableQuantity: QtyLike,
});

export function mapStanleyStellaCatalog(raw: unknown): SupplierCatalogItem {
  const r = parse(StanleyStellaSchema, raw, "Stanley/Stella");
  return {
    supplierSku: r.variantCode,
    sku: r.ean,
    ekCents: eurToCents(r.prices.wholesale),
    availableQty: r.availableQuantity ?? null,
  };
}

/** Mapper-Dispatch nach Connector-Art. */
const MAPPERS: Partial<Record<SupplierKind, (raw: unknown) => SupplierCatalogItem>> = {
  ID_IDENTITY: mapIdIdentityCatalog,
  STANLEY_STELLA: mapStanleyStellaCatalog,
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
