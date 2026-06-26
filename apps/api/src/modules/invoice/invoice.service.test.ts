import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryInvoiceRepository } from "../../repositories/in-memory-invoice.repository.js";
import { NumberingService } from "../numbering/numbering.service.js";
import { InMemoryNumberingRepository } from "../../repositories/in-memory-numbering.repository.js";
import { InvoiceError, InvoiceService } from "./invoice.service.js";

function setup(lines: Array<{ description: string; qty: number; unitNetCents: number; vatRate?: number }> = [{ description: "Polo blau L", qty: 12, unitNetCents: 1990 }]) {
  const orders = [{ id: "o1", number: "AB-2026-0001", companyId: "c1", zahlungszielTage: 14, lines, invoiceId: null as string | null, fakturastatus: "NICHT", status: "ANGELEGT" }];
  const repo = new InMemoryInvoiceRepository(orders);
  const numbering = new NumberingService(new InMemoryNumberingRepository());
  const service = new InvoiceService(repo, numbering, new MemoryAuditSink(), () => new Date("2026-06-23T10:00:00.000Z"));
  return { service, repo, orders };
}

describe("InvoiceService — Order → Invoice (Make-Target)", () => {
  it("erzeugt die Rechnung mit USt und meldet fakturastatus VOLL zurück", async () => {
    const { service, orders } = setup();
    const inv = await service.createFromOrder("o1");
    expect(inv.number).toMatch(/^RE-2026-/);
    expect(inv.netCents).toBe(12 * 1990); // 23.880
    expect(inv.taxCents).toBe(Math.round(12 * 1990 * 0.19)); // 19 % USt
    expect(inv.grossCents).toBe(inv.netCents + inv.taxCents);
    // Fortschritts-Rückmeldung an den Auftrag (per_billed = 100 %)
    expect(orders[0]!.fakturastatus).toBe("VOLL");
    expect(orders[0]!.status).toBe("FAKTURIERT");
  });

  it("übernimmt den USt-Satz je Position (steuerbefreit 0 % → keine USt)", async () => {
    // Steuerbefreiter Kunde: das Angebot setzt taxRatePct=0; der Satz wird über Auftrag→
    // Rechnung als vatRate=0 durchgereicht. Vorher rechnete die Rechnung fälschlich 19 %.
    const { service } = setup([{ description: "EU-B2B (Reverse-Charge)", qty: 10, unitNetCents: 5000, vatRate: 0 }]);
    const inv = await service.createFromOrder("o1");
    expect(inv.netCents).toBe(50000);
    expect(inv.taxCents).toBe(0);
    expect(inv.grossCents).toBe(50000);
  });

  it("mischt USt-Sätze je Position korrekt (7 % + 19 %)", async () => {
    const { service } = setup([
      { description: "Buch (ermäßigt)", qty: 4, unitNetCents: 1000, vatRate: 0.07 },
      { description: "Textil (Regelsatz)", qty: 2, unitNetCents: 2000, vatRate: 0.19 },
    ]);
    const inv = await service.createFromOrder("o1");
    expect(inv.netCents).toBe(4 * 1000 + 2 * 2000);
    expect(inv.taxCents).toBe(Math.round(4000 * 0.07) + Math.round(4000 * 0.19));
  });

  it("legt einen offenen Posten mit Fälligkeit = Zahlungsziel an", async () => {
    const { service, repo } = setup();
    await service.createFromOrder("o1");
    const op = repo.invoices[0]!;
    expect(op.openCents).toBe(op.grossCents);
    expect(op.dueDate.toISOString().slice(0, 10)).toBe("2026-07-07"); // +14 Tage
  });

  it("ist idempotent: ein bereits fakturierter Auftrag wirft", async () => {
    const { service } = setup();
    await service.createFromOrder("o1");
    await expect(service.createFromOrder("o1")).rejects.toBeInstanceOf(InvoiceError);
  });

  it("lehnt einen Auftrag ohne Positionen ab", async () => {
    const { service } = setup([]);
    await expect(service.createFromOrder("o1")).rejects.toBeInstanceOf(InvoiceError);
  });

  it("lehnt einen Auftrag mit Gesamtwert 0 € ab (P0-2)", async () => {
    const { service } = setup([{ description: "Gratis-Muster", qty: 5, unitNetCents: 0 }]);
    await expect(service.createFromOrder("o1")).rejects.toBeInstanceOf(InvoiceError);
  });

  it("wirft bei unbekanntem Auftrag", async () => {
    const { service } = setup();
    await expect(service.createFromOrder("nope")).rejects.toBeInstanceOf(InvoiceError);
  });
});

describe("InvoiceService — Storno per Gutschrift (GoBD-WORM)", () => {
  it("neutralisiert die Rechnung per Vollgutschrift und setzt fakturastatus zurück", async () => {
    const { service, repo, orders } = setup();
    const inv = await service.createFromOrder("o1");
    const cn = await service.cancelByCreditNote(inv.id, "Kunde hat storniert");
    expect(cn.number).toMatch(/^GS-2026-/);
    expect(cn.amountCents).toBe(inv.grossCents);
    expect(repo.invoices[0]!.openCents).toBe(0); // offener Posten neutralisiert
    expect(orders[0]!.fakturastatus).toBe("NICHT"); // Auftrag wieder offen für Faktura
  });

  it("verhindert die doppelte Gutschrift (zweiter Storno wirft)", async () => {
    const { service } = setup();
    const inv = await service.createFromOrder("o1");
    await service.cancelByCreditNote(inv.id, "Storno 1");
    await expect(service.cancelByCreditNote(inv.id, "Storno 2")).rejects.toBeInstanceOf(InvoiceError);
  });

  it("verlangt einen Gutschriftsgrund", async () => {
    const { service } = setup();
    const inv = await service.createFromOrder("o1");
    await expect(service.cancelByCreditNote(inv.id, "  ")).rejects.toBeInstanceOf(InvoiceError);
  });
});
