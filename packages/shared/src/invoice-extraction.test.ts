import { describe, expect, it } from "vitest";
import { parseInvoiceText } from "./invoice-extraction.js";

const TEXT = `
Lieferant: Garn & Co GmbH
USt-IdNr: DE123456789
Rechnungsnummer: ER-2026-0042
Datum: 05.03.2026
Netto: 200,00
USt: 38,00
Brutto: 238,00
Position: 10 x Garnrolle schwarz @ 10,00 [GARN-SW]
2 × Knopf 15mm @ 5,00
`;

describe("parseInvoiceText (OCR-Substitut: Rechnungstext → kanonische Form)", () => {
  it("liest Kopf + Positionen aus", () => {
    const r = parseInvoiceText(TEXT)!;
    expect(r.supplierName).toBe("Garn & Co GmbH");
    expect(r.supplierVatId).toBe("DE123456789");
    expect(r.number).toBe("ER-2026-0042");
    expect(r.issueDate).toEqual(new Date(Date.UTC(2026, 2, 5)));
    expect(r.netCents).toBe(20000);
    expect(r.taxCents).toBe(3800);
    expect(r.grossCents).toBe(23800);
    expect(r.lines).toEqual([
      { qty: 10, description: "Garnrolle schwarz", unitNetCents: 1000, supplierSku: "GARN-SW" },
      { qty: 2, description: "Knopf 15mm", unitNetCents: 500 },
    ]);
  });

  it("leitet Netto aus Brutto − USt ab, wenn Netto fehlt", () => {
    const r = parseInvoiceText("Lieferant: X\nRechnungsnr: R-1\nDatum: 2026-01-01\nUSt: 19,00\nBrutto: 119,00")!;
    expect(r.netCents).toBe(10000);
    expect(r.taxCents).toBe(1900);
  });

  it("liefert null ohne Pflichtfelder (kein Phantom-Beleg)", () => {
    expect(parseInvoiceText("nur Fließtext ohne Felder")).toBeNull();
    expect(parseInvoiceText("Lieferant: X\nBrutto: 100,00")).toBeNull(); // Nummer + Datum fehlen
  });
});
