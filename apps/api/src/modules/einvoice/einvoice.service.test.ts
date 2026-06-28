// Ausgangs-E-Rechnung (XRechnung-CII, Kap. 19): Mapping Rechnung → EN16931-XML + Validierung.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryEInvoiceRepository } from "../../repositories/in-memory-einvoice.repository.js";
import { EInvoiceError, EInvoiceService, type EInvoiceData } from "./einvoice.service.js";

const SELLER = { name: "TEXMA GmbH", vatId: "DE123456789", country: "DE" };
const OPTS = { seller: SELLER, taxRatePercent: 19 };

// 2 × 100,00 € netto = 200,00 € netto, 19 % USt = 38,00 €, brutto 238,00 €.
const DATA: EInvoiceData = {
  number: "RE-2026-0001",
  issuedAt: new Date("2026-03-05T10:00:00Z"),
  netCents: 20000,
  taxCents: 3800,
  grossCents: 23800,
  currency: "EUR",
  buyer: { name: "Maier GmbH", vatId: "DE987654321", country: "DE" },
  lines: [{ description: "Poloshirt bestickt", qty: 2, unitNetCents: 10000, listNetCents: null, rabattPct: null }],
};

function setup(data: EInvoiceData) {
  const repo = new InMemoryEInvoiceRepository({ inv1: data });
  return { repo, svc: new EInvoiceService(repo, new MemoryAuditSink()) };
}

describe("EInvoiceService.buildForInvoice (XRechnung-CII, EN16931)", () => {
  it("erzeugt gültige CII-XML und speichert sie am Beleg", async () => {
    const { repo, svc } = setup(DATA);
    const res = await svc.buildForInvoice("inv1", OPTS);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.filename).toBe("XRechnung-RE-2026-0001.xml");
    expect(res.xml).toContain("CrossIndustryInvoice");
    expect(res.xml).toContain("<ram:ID>RE-2026-0001</ram:ID>");
    expect(res.xml).toContain("DE123456789"); // Verkäufer-USt-IdNr.
    expect(res.xml).toContain("Maier GmbH"); // Käufer
    expect(res.xml).toContain("<ram:GrandTotalAmount>238.00</ram:GrandTotalAmount>");
    expect(repo.persisted.get("inv1")).toBe(res.xml); // gültig → am Beleg gespeichert
  });

  it("weist einen Positionsrabatt aus (Brutto-Listenpreis + Abschlag)", async () => {
    const { svc } = setup({
      ...DATA,
      // 1 × 90,00 € netto (Liste 100,00 €, 10 % Rabatt); USt 17,10 €, brutto 107,10 €.
      netCents: 9000, taxCents: 1710, grossCents: 10710,
      lines: [{ description: "Hoodie", qty: 1, unitNetCents: 9000, listNetCents: 10000, rabattPct: 10 }],
    });
    const res = await svc.buildForInvoice("inv1", OPTS);
    expect(res.valid).toBe(true);
    expect(res.xml).toContain("AppliedTradeAllowanceCharge");
    expect(res.xml).toContain("Positionsrabatt 10 %");
  });

  it("meldet ungültige E-Rechnung (fehlende Verkäufer-USt-IdNr.) und speichert NICHT", async () => {
    const { repo, svc } = setup(DATA);
    const res = await svc.buildForInvoice("inv1", { seller: { name: "TEXMA GmbH", country: "DE" }, taxRatePercent: 19 });
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toContain("BT-31");
    expect(repo.persisted.has("inv1")).toBe(false); // ungültig → nicht persistiert
  });

  it("wirft bei unbekannter Rechnung", async () => {
    const { svc } = setup(DATA);
    await expect(svc.buildForInvoice("nope", OPTS)).rejects.toBeInstanceOf(EInvoiceError);
  });
});
