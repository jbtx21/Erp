import { describe, expect, it } from "vitest";
import { buildEInvoiceXml, type EInvoiceModel } from "./einvoice.js";
import { parseEInvoiceXml, receiveEInvoice } from "./einvoice-inbound.js";

const model: EInvoiceModel = {
  invoiceNumber: "ER-2026-0815",
  issueDate: new Date(Date.UTC(2026, 5, 10)),
  currency: "EUR",
  seller: { name: "Stoff Lieferant GmbH", vatId: "DE123456789", country: "DE" },
  buyer: { name: "TEXMA GmbH", country: "DE" },
  lines: [
    {
      id: "1",
      name: "T-Shirt blanko",
      qty: 100,
      unitNetCents: 500,
      lineNetCents: 50000,
      vatRatePercent: 19,
    },
  ],
  netCents: 50000,
  taxCents: 9500,
  grossCents: 59500,
};

describe("E-Rechnung Eingang (K-13)", () => {
  it("parst eine erzeugte CII-Rechnung verlustfrei in die Kernfelder zurück", () => {
    const parsed = parseEInvoiceXml(buildEInvoiceXml(model));
    expect(parsed.invoiceNumber).toBe("ER-2026-0815");
    expect(parsed.currency).toBe("EUR");
    expect(parsed.seller?.name).toBe("Stoff Lieferant GmbH");
    expect(parsed.seller?.vatId).toBe("DE123456789");
    expect(parsed.buyer?.name).toBe("TEXMA GmbH");
    expect(parsed.netCents).toBe(50000);
    expect(parsed.taxCents).toBe(9500);
    expect(parsed.grossCents).toBe(59500);
    expect(parsed.lineCount).toBe(1);
    expect(parsed.issueDate?.toISOString().slice(0, 10)).toBe("2026-06-10");
  });

  it("erzeugt bei gültiger Rechnung einen IncomingInvoice-Entwurf", () => {
    const res = receiveEInvoice(buildEInvoiceXml(model));
    expect(res.validation.valid).toBe(true);
    expect(res.draft).toMatchObject({
      supplierName: "Stoff Lieferant GmbH",
      number: "ER-2026-0815",
      netCents: 50000,
      grossCents: 59500,
    });
  });

  it("liefert keinen Entwurf, wenn Pflichtfelder fehlen (geht in Klärung)", () => {
    const xml = "<rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>";
    const res = receiveEInvoice(xml);
    expect(res.validation.valid).toBe(false);
    expect(res.draft).toBeUndefined();
    expect(res.validation.errors.length).toBeGreaterThan(0);
  });
});
