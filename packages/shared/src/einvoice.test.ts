import { describe, expect, it } from "vitest";
import { buildEInvoiceXml, validateEInvoice, type EInvoiceModel } from "./einvoice.js";

const model: EInvoiceModel = {
  invoiceNumber: "RE-2026-0001",
  issueDate: new Date("2026-03-05T00:00:00Z"),
  currency: "EUR",
  seller: { name: "TEXMA GmbH", vatId: "DE123456789", country: "DE" },
  buyer: { name: "Muster AG", country: "DE" },
  lines: [
    {
      id: "1",
      name: "T-Shirt bedruckt",
      qty: 10,
      unitNetCents: 1990,
      lineNetCents: 19900,
      vatRatePercent: 19,
    },
  ],
  netCents: 19900,
  taxCents: 3781,
  grossCents: 23681,
};

describe("E-Rechnung Erzeugung (Kap. 19)", () => {
  it("erzeugt CII-XML mit Pflicht-Geschäftsobjekten", () => {
    const xml = buildEInvoiceXml(model);
    expect(xml).toContain("<rsm:CrossIndustryInvoice");
    expect(xml).toContain("<ram:ID>RE-2026-0001</ram:ID>");
    expect(xml).toContain("format=\"102\">20260305</udt:DateTimeString>");
    expect(xml).toContain("DE123456789");
    expect(xml).toContain("<ram:GrandTotalAmount>236.81</ram:GrandTotalAmount>");
  });

  it("escaped Sonderzeichen in Namen", () => {
    const xml = buildEInvoiceXml({
      ...model,
      buyer: { name: "Meyer & Söhne <KG>", country: "DE" },
    });
    expect(xml).toContain("Meyer &amp; Söhne &lt;KG&gt;");
  });
});

describe("E-Rechnung Eingangsvalidierung (Kap. 19)", () => {
  it("akzeptiert eine vollständige Rechnung", () => {
    expect(validateEInvoice(model)).toEqual({ valid: true, errors: [] });
  });

  it("meldet fehlende Pflichtfelder und Summenfehler", () => {
    const r = validateEInvoice({
      issueDate: new Date(),
      currency: "EUR",
      seller: { name: "TEXMA", country: "DE" },
      buyer: { name: "X", country: "DE" },
      lines: model.lines,
      netCents: 100,
      taxCents: 19,
      grossCents: 200,
    });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("BT-1 Rechnungsnummer fehlt");
    expect(r.errors).toContain("BT-31 USt-IdNr. Verkäufer fehlt");
    expect(r.errors).toContain("BR-CO-15 Brutto ≠ Netto + Steuer");
  });
});
