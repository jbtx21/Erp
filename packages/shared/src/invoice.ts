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
 * Berechnet die Rechnungssummen aus den Zeilen. Steuer wird je Zeile auf den
 * Zeilennetto gerundet und je Steuersatz aggregiert (saubere USt-Ausweisung).
 */
export function buildInvoiceTotals(lines: ReadonlyArray<InvoiceLineInput>): InvoiceTotals {
  if (lines.length === 0) throw new Error("Rechnung ohne Positionen");
  const byRate = new Map<number, { netCents: Cents; taxCents: Cents }>();
  const outLines: InvoiceLine[] = [];

  for (const l of lines) {
    const vatRate = l.vatRate ?? VAT_STANDARD;
    const netCents = lineNet(l.qty, l.unitNetCents);
    const taxCents = taxOnNet(netCents, vatRate);
    outLines.push({ ...l, vatRate, netCents, taxCents });
    const acc = byRate.get(vatRate) ?? { netCents: 0, taxCents: 0 };
    acc.netCents += netCents;
    acc.taxCents += taxCents;
    byRate.set(vatRate, acc);
  }

  const netTotal = outLines.reduce((s, l) => s + l.netCents, 0);
  const taxTotal = outLines.reduce((s, l) => s + l.taxCents, 0);

  return {
    lines: outLines,
    netCents: netTotal,
    taxCents: taxTotal,
    grossCents: netTotal + taxTotal,
    taxByRate: [...byRate.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rate, v]) => ({ rate, netCents: v.netCents, taxCents: v.taxCents })),
  };
}
