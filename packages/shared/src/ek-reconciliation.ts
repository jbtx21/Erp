// EK-Abgleich Eingangsrechnung ↔ Artikelstammdaten (Kap. 6/9.6): je Rechnungsposition den
// berechneten Einkaufspreis gegen den Stamm-EK (SupplierItem.ekCents) prüfen. Reine, IO-freie
// Logik — steuert die Zahlungsfreigabe: nur ohne Abweichung läuft die Rechnung automatisch
// in die Freigabe, sonst manuelle Prüfung (GetMyInvoices-Vorbild: prüfen → freigeben → zahlen).

import type { Cents } from "./money.js";

/** Rechnungsposition mit (aufgelöstem) Artikel + berechnetem EK je Stück. */
export interface EkInvoiceLine {
  /** Anzeige-Referenz (Lieferanten-SKU / interne SKU / Bezeichnung). */
  ref: string;
  /** Aufgelöste interne Variante; null = Position keinem Artikel zuordenbar. */
  variantId: string | null;
  qty: number;
  /** EK je Stück laut Rechnung (Netto, Cent). */
  invoiceUnitEkCents: Cents;
}

/** Stamm-EK je Variante (aus SupplierItem.ekCents des Lieferanten). */
export type EkMasterPrices = ReadonlyMap<string, Cents>;

export type EkLineVerdict = "OK" | "ABWEICHUNG" | "NICHT_ZUGEORDNET" | "KEIN_STAMM";

export interface EkLineResult {
  ref: string;
  variantId: string | null;
  qty: number;
  invoiceUnitEkCents: Cents;
  /** Stamm-EK je Stück; null = nicht zuordenbar oder kein Stammpreis. */
  masterEkCents: Cents | null;
  /** Abweichung je Stück (Rechnung − Stamm), Cent. */
  diffCents: Cents;
  /** Abweichung in Prozent vom Stamm-EK (0, wenn nicht vergleichbar). */
  diffPercent: number;
  verdict: EkLineVerdict;
}

export type EkOverall = "OK" | "ABWEICHUNG" | "PRUEFUNG";

export interface EkReconciliationResult {
  lines: EkLineResult[];
  /** OK = alle Positionen im Rahmen; ABWEICHUNG = mind. eine über Toleranz;
   *  PRUEFUNG = keine Abweichung, aber nicht alle Positionen vergleichbar (kein Stamm / nicht zugeordnet). */
  overall: EkOverall;
  /** Größte absolute prozentuale Abweichung (für die Anzeige/Sortierung). */
  maxAbsDiffPercent: number;
}

export interface EkReconciliationOptions {
  /** Toleranzband in Prozent (Default 2 %). */
  tolerancePercent?: number;
  /** Cent-Untergrenze gegen Rundungsrauschen bei Kleinstpreisen (Default 2 ct). */
  toleranceFloorCents?: number;
}

/**
 * Gleicht die Rechnungspositionen gegen den Stamm-EK ab. Eine Position gilt als OK, wenn die
 * absolute Abweichung je Stück innerhalb von max(Toleranz-% des Stamm-EK, Cent-Untergrenze)
 * liegt. Nicht zuordenbare Positionen / fehlende Stammpreise blockieren NICHT als Abweichung,
 * erzwingen aber die manuelle Prüfung (overall = PRUEFUNG).
 */
export function reconcileEk(
  lines: ReadonlyArray<EkInvoiceLine>,
  master: EkMasterPrices,
  opts: EkReconciliationOptions = {}
): EkReconciliationResult {
  const tolPct = opts.tolerancePercent ?? 2;
  const floor = opts.toleranceFloorCents ?? 2;

  let anyDeviation = false;
  let anyUnpriced = false;
  let maxAbsDiffPercent = 0;

  const results: EkLineResult[] = lines.map((l) => {
    const masterEkCents = l.variantId != null ? master.get(l.variantId) ?? null : null;
    if (l.variantId == null) {
      anyUnpriced = true;
      return { ...l, masterEkCents: null, diffCents: 0, diffPercent: 0, verdict: "NICHT_ZUGEORDNET" };
    }
    if (masterEkCents == null) {
      anyUnpriced = true;
      return { ...l, masterEkCents: null, diffCents: 0, diffPercent: 0, verdict: "KEIN_STAMM" };
    }
    const diffCents = l.invoiceUnitEkCents - masterEkCents;
    const diffPercent = masterEkCents !== 0 ? (diffCents / masterEkCents) * 100 : 0;
    maxAbsDiffPercent = Math.max(maxAbsDiffPercent, Math.abs(diffPercent));
    const tol = Math.max(Math.round((masterEkCents * tolPct) / 100), floor);
    const verdict: EkLineVerdict = Math.abs(diffCents) <= tol ? "OK" : "ABWEICHUNG";
    if (verdict === "ABWEICHUNG") anyDeviation = true;
    return { ...l, masterEkCents, diffCents, diffPercent, verdict };
  });

  const overall: EkOverall = anyDeviation ? "ABWEICHUNG" : anyUnpriced ? "PRUEFUNG" : "OK";
  return { lines: results, overall, maxAbsDiffPercent };
}
