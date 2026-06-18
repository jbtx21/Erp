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
