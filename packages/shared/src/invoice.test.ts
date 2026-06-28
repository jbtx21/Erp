import { describe, expect, it } from "vitest";
import { buildInvoiceTotals, VAT_REDUCED, VAT_STANDARD } from "./invoice.js";

describe("Faktura — Rechnungssummen (Kap. 9.1)", () => {
  it("summiert Netto/Steuer/Brutto über die Zeilen", () => {
    const t = buildInvoiceTotals([
      { description: "T-Shirt bedruckt", qty: 10, unitNetCents: 1990 },
      { description: "Einrichtung", qty: 1, unitNetCents: 3500 },
    ]);
    expect(t.netCents).toBe(19900 + 3500);
    expect(t.taxCents).toBe(Math.round(23400 * VAT_STANDARD));
    expect(t.grossCents).toBe(t.netCents + t.taxCents);
  });

  it("weist Steuer je Satz getrennt aus", () => {
    const t = buildInvoiceTotals([
      { description: "Textil", qty: 1, unitNetCents: 10000, vatRate: VAT_STANDARD },
      { description: "Buch/Sonderfall", qty: 1, unitNetCents: 5000, vatRate: VAT_REDUCED },
    ]);
    expect(t.taxByRate).toEqual([
      { rate: VAT_REDUCED, netCents: 5000, taxCents: 350 },
      { rate: VAT_STANDARD, netCents: 10000, taxCents: 1900 },
    ]);
  });

  it("lehnt Rechnungen ohne Positionen ab", () => {
    expect(() => buildInvoiceTotals([])).toThrow();
  });

  it("aggregiert USt je Satz auf den Summen-Netto — kein akkumulierter Rundungsfehler (INV-ROUND-100)", () => {
    const lines = Array.from({ length: 100 }, () => ({ description: "Cent-Position", qty: 1, unitNetCents: 1, vatRate: VAT_STANDARD }));
    const t = buildInvoiceTotals(lines);
    expect(t.netCents).toBe(100);
    expect(t.taxCents).toBe(19); // round(100 * 0,19), NICHT 100× round(0,19)=0
    expect(t.grossCents).toBe(119);
    expect(t.taxByRate).toEqual([{ rate: VAT_STANDARD, netCents: 100, taxCents: 19 }]);
    // Gesamt-Steuer ist stets die Summe der Satz-Steuern (konsistent für DATEV/E-Rechnung).
    expect(t.taxCents).toBe(t.taxByRate.reduce((s, r) => s + r.taxCents, 0));
  });
});
