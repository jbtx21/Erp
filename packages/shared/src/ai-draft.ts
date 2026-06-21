// KI-Freitexterfassung Anfrage→Angebot (B14, Kap. 22.2). Reine Validierung des vom
// LLM extrahierten Entwurfs gegen den Varianten-/Preiskatalog. Die LLM-Extraktion
// liegt hinter einem Port (Claude-API, apps/api). MENSCH-FREIGABE ist Pflicht —
// diese Logik erzeugt NIE ein verbindliches Angebot; nicht zuordenbare Zeilen
// bleiben markiert und gehen in die manuelle Prüfung.

import type { Cents } from "./money.js";
import { lineNet } from "./money.js";

export interface ExtractedLine {
  /** Vom LLM erkannte Artikel-/Variantenbeschreibung (Freitext). */
  query: string;
  qty: number;
}

export interface ExtractedQuoteDraft {
  lines: ExtractedLine[];
  note?: string;
}

export interface CatalogEntry {
  variantId: string;
  sku: string;
  name: string;
  netCents: Cents;
}

export interface ResolvedLine {
  query: string;
  qty: number;
  variantId?: string;
  sku?: string;
  netCents?: Cents;
  lineNetCents?: Cents;
  matched: boolean;
}

export interface ValidatedDraft {
  lines: ResolvedLine[];
  allMatched: boolean;
  /** IMMER true — ein KI-Entwurf muss vom Menschen freigegeben werden (Kap. 22.2). */
  requiresApproval: true;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Matcht eine Freitextzeile auf einen Katalogeintrag: exakte SKU → exakter Name →
 * EINDEUTIGER Teiltreffer. Mehrdeutige Treffer gelten als nicht zugeordnet (manuell).
 */
export function matchCatalog(
  query: string,
  catalog: ReadonlyArray<CatalogEntry>
): CatalogEntry | undefined {
  const q = normalize(query);
  if (q.length === 0) return undefined;

  const bySku = catalog.find((c) => normalize(c.sku) === q);
  if (bySku) return bySku;

  const byName = catalog.find((c) => normalize(c.name) === q);
  if (byName) return byName;

  const partial = catalog.filter(
    (c) => normalize(c.name).includes(q) || q.includes(normalize(c.sku))
  );
  return partial.length === 1 ? partial[0] : undefined;
}

/** Validiert den LLM-Entwurf gegen den Katalog; nicht zuordenbare Zeilen markiert. */
export function resolveDraft(
  draft: ExtractedQuoteDraft,
  catalog: ReadonlyArray<CatalogEntry>
): ValidatedDraft {
  const lines: ResolvedLine[] = draft.lines.map((l) => {
    const hit = l.qty > 0 ? matchCatalog(l.query, catalog) : undefined;
    if (!hit) return { query: l.query, qty: l.qty, matched: false };
    return {
      query: l.query,
      qty: l.qty,
      variantId: hit.variantId,
      sku: hit.sku,
      netCents: hit.netCents,
      lineNetCents: lineNet(l.qty, hit.netCents),
      matched: true,
    };
  });
  return { lines, allMatched: lines.length > 0 && lines.every((l) => l.matched), requiresApproval: true };
}
