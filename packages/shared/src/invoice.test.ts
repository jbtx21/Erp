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
});
