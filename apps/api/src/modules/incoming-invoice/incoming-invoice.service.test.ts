// E-Rechnung-Empfang (C4, Kap. 19/K-13): Validierung, Lieferantenauflösung (vatId/
// Name), Idempotenz und Klärungspfade. In-Memory, keine DB. Gültige CII-XML wird mit
// dem Ausgangs-Builder erzeugt (verlustfreier Roundtrip).

import { describe, expect, it } from "vitest";
import { buildEInvoiceXml, type EInvoiceModel } from "@texma/shared";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryIncomingInvoiceRepository } from "../../repositories/in-memory-incoming-invoice.repository.js";
import { IncomingInvoiceService } from "./incoming-invoice.service.js";

const model = (overrides: Partial<EInvoiceModel> = {}): EInvoiceModel => ({
  invoiceNumber: "ER-2026-0815",
  issueDate: new Date(Date.UTC(2026, 5, 10)),
  currency: "EUR",
  seller: { name: "Stoff Lieferant GmbH", vatId: "DE123456789", country: "DE" },
  buyer: { name: "TEXMA GmbH", country: "DE" },
  lines: [{ id: "1", name: "T-Shirt", qty: 100, unitNetCents: 500, lineNetCents: 50000, vatRatePercent: 19 }],
  netCents: 50000,
  taxCents: 9500,
  grossCents: 59500,
  ...overrides,
});

function setup() {
  const repo = new InMemoryIncomingInvoiceRepository([
    { id: "sup_stoff", name: "Stoff Lieferant GmbH", vatId: "DE123456789" },
  ]);
  return { repo, service: new IncomingInvoiceService(repo, new MemoryAuditSink()) };
}

describe("IncomingInvoiceService.receive (C4)", () => {
  it("erfasst eine gültige E-Rechnung und löst den Lieferanten über die USt-IdNr. auf", async () => {
    const { service } = setup();
    const res = await service.receive(buildEInvoiceXml(model()));
    expect(res).toMatchObject({ status: "ERFASST", supplierId: "sup_stoff", number: "ER-2026-0815", created: true });
  });

  it("löst auch über den Namen auf, wenn keine USt-IdNr. matcht", async () => {
    const repo = new InMemoryIncomingInvoiceRepository([{ id: "sup_name", name: "Stoff Lieferant GmbH" }]);
    const service = new IncomingInvoiceService(repo, new MemoryAuditSink());
    const res = await service.receive(buildEInvoiceXml(model()));
    expect(res).toMatchObject({ status: "ERFASST", supplierId: "sup_name" });
  });

  it("schickt ungültige Rechnungen in die Klärung (kein Persistieren)", async () => {
    const { service } = setup();
    const res = await service.receive("<rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>");
    expect(res.status).toBe("KLAERUNG");
    if (res.status === "KLAERUNG") {
      expect(res.reason).toBe("VALIDIERUNG");
      expect(res.details.length).toBeGreaterThan(0);
    }
  });

  it("schickt unbekannte Lieferanten in die Klärung", async () => {
    const repo = new InMemoryIncomingInvoiceRepository([]); // keine Lieferanten
    const service = new IncomingInvoiceService(repo, new MemoryAuditSink());
    const res = await service.receive(buildEInvoiceXml(model()));
    expect(res).toMatchObject({ status: "KLAERUNG", reason: "LIEFERANT_UNBEKANNT" });
  });

  it("ist idempotent über (supplierId, number)", async () => {
    const { service } = setup();
    const first = await service.receive(buildEInvoiceXml(model()));
    const again = await service.receive(buildEInvoiceXml(model({ grossCents: 59500 })));
    expect(first).toMatchObject({ created: true });
    expect(again).toMatchObject({ status: "ERFASST", created: false });
    if (first.status === "ERFASST" && again.status === "ERFASST") {
      expect(again.incomingInvoiceId).toBe(first.incomingInvoiceId);
    }
  });
});

describe("Auto-Match-Toleranz (IIN-001)", () => {
  function setupWithPo(po: { id: string; expectedNetCents: number } | null) {
    const repo = new InMemoryIncomingInvoiceRepository([{ id: "sup_stoff", name: "Stoff Lieferant GmbH", vatId: "DE123456789" }]);
    repo.findSoleOpenPoForSupplier = async () => po;
    return new IncomingInvoiceService(repo, new MemoryAuditSink());
  }

  it("sperrt eine 10,99-€-Rechnung gegen eine 10-€-Bestellung (kein 10-%-Floor mehr)", async () => {
    const service = setupWithPo({ id: "po1", expectedNetCents: 1000 });
    const res = await service.receive(buildEInvoiceXml(model({ netCents: 1099, taxCents: 209, grossCents: 1308, lines: [{ id: "1", name: "Stoff", qty: 1, unitNetCents: 1099, lineNetCents: 1099, vatRatePercent: 19 }] })));
    expect(res).toMatchObject({ status: "GESPERRT", matched: true });
  });

  it("prüft eine 10,10-€-Rechnung innerhalb realer 2 % gegen eine 10-€-Bestellung", async () => {
    const service = setupWithPo({ id: "po1", expectedNetCents: 1000 }); // Δ=10 ct ≤ 2 % (20 ct)
    const res = await service.receive(buildEInvoiceXml(model({ netCents: 1010, taxCents: 192, grossCents: 1202, lines: [{ id: "1", name: "Stoff", qty: 1, unitNetCents: 1010, lineNetCents: 1010, vatRatePercent: 19 }] })));
    expect(res).toMatchObject({ status: "GEPRUEFT", matched: true });
  });

  it("deckelt die Toleranz bei Großbestellungen (CAP 500 €)", async () => {
    const service = setupWithPo({ id: "po1", expectedNetCents: 10_000_000 }); // 100.000 €, Δ=600 € > 500 €
    const res = await service.receive(buildEInvoiceXml(model({ netCents: 10_060_000, taxCents: 1_911_400, grossCents: 11_971_400, lines: [{ id: "1", name: "Stoff", qty: 1, unitNetCents: 10_060_000, lineNetCents: 10_060_000, vatRatePercent: 19 }] })));
    expect(res).toMatchObject({ status: "GESPERRT", matched: true });
  });

  it("fängt reines Cent-Rundungsrauschen über den LOW_FLOOR ab (Δ ≤ 5 ct → GEPRUEFT)", async () => {
    const service = setupWithPo({ id: "po1", expectedNetCents: 200 }); // 2 % = 4 ct, Floor 5 ct greift
    const res = await service.receive(buildEInvoiceXml(model({ netCents: 204, taxCents: 39, grossCents: 243, lines: [{ id: "1", name: "Stoff", qty: 1, unitNetCents: 204, lineNetCents: 204, vatRatePercent: 19 }] })));
    expect(res).toMatchObject({ status: "GEPRUEFT", matched: true });
  });
});

describe("OCR-Erfassung + EK-Abgleich + Freigabe + Zahlung (GetMyInvoices-Workflow)", () => {
  const OCR_TEXT = `
Lieferant: Garn & Co GmbH
USt-IdNr: DE999888777
Rechnungsnummer: ER-2026-0042
Datum: 05.03.2026
Netto: 100,00
USt: 19,00
Brutto: 119,00
10 x Garnrolle @ 10,00 [GARN-SW]
`;

  function setupWorkflow(masterEk: Record<string, number>) {
    const repo = new InMemoryIncomingInvoiceRepository([
      { id: "sup_garn", name: "Garn & Co GmbH", vatId: "DE999888777", zahlungszielTage: 30, skontoPercent: 2, skontoDays: 10, skuToVariant: { "GARN-SW": "v1" }, masterEk },
    ]);
    return { repo, service: new IncomingInvoiceService(repo, new MemoryAuditSink()) };
  }

  it("erfasst per OCR-Text, löst supplierSku → Variante auf und schreibt den Konditions-Snapshot", async () => {
    const { service } = setupWorkflow({ v1: 1000 });
    const res = await service.receiveOcrText(OCR_TEXT);
    expect(res.status).toBe("ERFASST");
    if (res.status !== "ERFASST") return;
    const d = await service.detail(res.incomingInvoiceId);
    expect(d.source).toBe("OCR");
    expect(d.lines[0]).toMatchObject({ variantId: "v1", unitEkCents: 1000, masterEkCents: 1000 });
    // 30 Tage Ziel ab 05.03. → 04.04.; Skonto 10 Tage → 15.03.
    expect(d.dueDate).toEqual(new Date(Date.UTC(2026, 3, 4)));
    expect(d.skontoUntil).toEqual(new Date(Date.UTC(2026, 2, 15)));
  });

  it("EK-Abgleich OK → freigeben → bezahlen mit Skonto innerhalb der Frist", async () => {
    const { service } = setupWorkflow({ v1: 1000 }); // Stamm-EK = Rechnungs-EK
    const res = await service.receiveOcrText(OCR_TEXT);
    if (res.status !== "ERFASST") throw new Error("unerwartet");
    const id = res.incomingInvoiceId;

    expect((await service.runEkCheck(id)).overall).toBe("OK");
    await service.freigeben(id, "buha@texma.de", { role: "BUCHHALTUNG" });
    const pay = await service.markPaid(id, { asOf: new Date(Date.UTC(2026, 2, 12)) }); // im Skontofenster
    expect(pay.withSkonto).toBe(true);
    expect(pay.amountCents).toBe(11900 - 238); // 2 % von 119,00 € = 2,38 €
  });

  it("EK-Abweichung sperrt die Freigabe für BÜRO, ADMIN darf übersteuern", async () => {
    const { service } = setupWorkflow({ v1: 800 }); // Stamm 8,00 € vs. Rechnung 10,00 € = +25 %
    const res = await service.receiveOcrText(OCR_TEXT);
    if (res.status !== "ERFASST") throw new Error("unerwartet");
    const id = res.incomingInvoiceId;

    expect((await service.runEkCheck(id)).overall).toBe("ABWEICHUNG");
    await expect(service.freigeben(id, "buero@texma.de", { role: "BUERO" })).rejects.toThrow(/Geschäftsleitung/);
    await service.freigeben(id, "chef@texma.de", { role: "ADMIN" });
    expect((await service.detail(id)).status).toBe("FREIGEGEBEN");
  });

  it("blockiert Zahlung ohne Freigabe und Freigabe ohne EK-Abgleich", async () => {
    const { service } = setupWorkflow({ v1: 1000 });
    const res = await service.receiveOcrText(OCR_TEXT);
    if (res.status !== "ERFASST") throw new Error("unerwartet");
    const id = res.incomingInvoiceId;
    await expect(service.freigeben(id, "x", {})).rejects.toThrow(/EK-Abgleich/);
    await expect(service.markPaid(id)).rejects.toThrow(/freigegeben/);
  });
});
