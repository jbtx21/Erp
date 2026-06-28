// Faktura — Kap. 9.1. Rechnungsbeträge aus Auftragszeilen.
// Beträge strikt in Cent (Integer). ERP = Rechnungsnummern-Master (Kap. 19).

import { type Cents, lineNet, taxOnNet } from "./money.js";

/** Regelsteuersatz DE. Reduzierter Satz separat pro Zeile möglich. */
export const VAT_STANDARD = 0.19;
export const VAT_REDUCED = 0.07;

export interface InvoiceLineInput {
  description: string;
  qty: number;
  unitNetCents: Cents;
  vatRate?: number; // default VAT_STANDARD
}

export interface InvoiceLine extends InvoiceLineInput {
  vatRate: number;
  netCents: Cents;
  taxCents: Cents;
}

export interface InvoiceTotals {
  lines: InvoiceLine[];
  netCents: Cents;
  taxCents: Cents;
  grossCents: Cents;
  /** Steuer je Satz (für Rechnungsausweis & DATEV). */
  taxByRate: Array<{ rate: number; netCents: Cents; taxCents: Cents }>;
}

/**
 * Berechnet die Rechnungssummen aus den Zeilen. Netto wird je Steuersatz
 * aufsummiert und die Steuer **einmal je Satz** auf den Summen-Netto gerundet
 * (USt zentral / je Satz aggregiert, nicht je Position). Die per-Zeilen-`taxCents`
 * sind nur informativ (Anzeige) und fließen NICHT in die Summen — sonst entstehen
 * akkumulierte Rundungsfehler (z. B. 100×1 ct @19 % → je Zeile round(0,19)=0 →
 * Gesamt-Steuer fälschlich 0 statt 19 ct; INV-ROUND-100/GoBD).
 */
export function buildInvoiceTotals(lines: ReadonlyArray<InvoiceLineInput>): InvoiceTotals {
  if (lines.length === 0) throw new Error("Rechnung ohne Positionen");
  const netByRate = new Map<number, Cents>();
  const outLines: InvoiceLine[] = [];

  for (const l of lines) {
    const vatRate = l.vatRate ?? VAT_STANDARD;
    const netCents = lineNet(l.qty, l.unitNetCents);
    // taxCents je Zeile nur informativ (Anzeige); fließt NICHT in die Summen.
    const taxCents = taxOnNet(netCents, vatRate);
    outLines.push({ ...l, vatRate, netCents, taxCents });
    netByRate.set(vatRate, (netByRate.get(vatRate) ?? 0) + netCents);
  }

  const taxByRate = [...netByRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, netCents]) => ({ rate, netCents, taxCents: taxOnNet(netCents, rate) }));

  const netTotal = taxByRate.reduce((s, r) => s + r.netCents, 0);
  const taxTotal = taxByRate.reduce((s, r) => s + r.taxCents, 0);

  return {
    lines: outLines,
    netCents: netTotal,
    taxCents: taxTotal,
    grossCents: netTotal + taxTotal,
    taxByRate,
  };
}
