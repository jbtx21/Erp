import { describe, expect, it } from "vitest";
import {
  buildEInvoiceXml,
  validateEInvoice,
  validateEInvoiceTwoStage,
  type EInvoiceModel,
  type EInvoiceValidationResult,
} from "./einvoice.js";

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

  it("weist den Positionsrabatt als Preisabschlag aus (BT-148/147/146)", () => {
    const xml = buildEInvoiceXml({
      ...model,
      lines: [{ id: "1", name: "Polo", qty: 10, unitNetCents: 1350, lineNetCents: 13500, vatRatePercent: 19, grossUnitNetCents: 1500, discountReason: "Positionsrabatt 10 %" }],
      netCents: 13500, taxCents: 2565, grossCents: 16065,
    });
    expect(xml).toContain("<ram:GrossPriceProductTradePrice><ram:ChargeAmount>15.00</ram:ChargeAmount>");
    expect(xml).toContain("<udt:Indicator>false</udt:Indicator>");
    expect(xml).toContain("<ram:ActualAmount>1.50</ram:ActualAmount>"); // Abschlag je Stück
    expect(xml).toContain("<ram:Reason>Positionsrabatt 10 %</ram:Reason>");
    expect(xml).toContain("<ram:NetPriceProductTradePrice><ram:ChargeAmount>13.50</ram:ChargeAmount>");
  });

  it("ohne Rabatt bleibt der Preisblock unverändert (nur Netto-Preis)", () => {
    const xml = buildEInvoiceXml(model);
    expect(xml).not.toContain("GrossPriceProductTradePrice");
  });
});

describe("E-Rechnung Eingangsvalidierung (Kap. 19)", () => {
  it("akzeptiert eine vollständige Rechnung", () => {
    expect(validateEInvoice(model)).toEqual({ valid: true, errors: [] });
  });

  it("lehnt einen Brutto-Einzelpreis unter dem Netto-Preis ab (BT-148)", () => {
    const r = validateEInvoice({
      ...model,
      lines: [{ id: "1", name: "Polo", qty: 10, unitNetCents: 1500, lineNetCents: 15000, vatRatePercent: 19, grossUnitNetCents: 1400 }],
      netCents: 15000, taxCents: 2850, grossCents: 17850,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("BT-148"))).toBe(true);
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
    // BR-CO-10: Positionsnetto (19900) ≠ Rechnungsnetto (100).
    expect(r.errors).toContain("BR-CO-10 Σ Positionsnetto ≠ Rechnungsnetto (BT-106)");
  });

  it("meldet Positions-Pflichtangaben (BR-21/BR-25/BT-129)", () => {
    const r = validateEInvoice({
      ...model,
      lines: [{ id: "", name: "", qty: 0, unitNetCents: 0, lineNetCents: 0, vatRatePercent: 19 }],
      netCents: 0,
    });
    expect(r.errors).toContain("BR-21 Positions-ID fehlt (Zeile 1)");
    expect(r.errors).toContain("BR-25 Artikelname fehlt (Zeile 1)");
    expect(r.errors).toContain("BT-129 Menge fehlt/≤0 (Zeile 1)");
  });
});

describe("Zweistufige EN16931-Validierung (F3)", () => {
  it("führt Stufe 2 nur aus, wenn Stufe 1 sauber ist", async () => {
    let stage2Calls = 0;
    const schematron = async (): Promise<EInvoiceValidationResult> => {
      stage2Calls++;
      return { valid: true, errors: [] };
    };

    // Stufe 1 rot → Stufe 2 wird übersprungen (kein Sidecar-Aufruf).
    const broken = await validateEInvoiceTwoStage({ model: { invoiceNumber: "" }, xml: "<x/>", schematron });
    expect(broken.valid).toBe(false);
    expect(broken.stage2).toBeNull();
    expect(stage2Calls).toBe(0);

    // Stufe 1 grün → Stufe 2 läuft und entscheidet mit.
    const ok = await validateEInvoiceTwoStage({ model, xml: buildEInvoiceXml(model), schematron });
    expect(stage2Calls).toBe(1);
    expect(ok.valid).toBe(true);
    expect(ok.stage2).toEqual({ valid: true, errors: [] });
  });

  it("ohne Validator bleibt es bei Stufe 1 (JVM-frei)", async () => {
    const r = await validateEInvoiceTwoStage({ model });
    expect(r.valid).toBe(true);
    expect(r.stage2).toBeNull();
  });

  it("Stufe 2 kann eine Stufe-1-saubere Rechnung noch ablehnen", async () => {
    const schematron = async (): Promise<EInvoiceValidationResult> => ({
      valid: false,
      errors: ["BR-DE-15 Leitweg-ID fehlt (KoSIT)"],
    });
    const r = await validateEInvoiceTwoStage({ model, xml: buildEInvoiceXml(model), schematron });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("BR-DE-15 Leitweg-ID fehlt (KoSIT)");
  });
});
