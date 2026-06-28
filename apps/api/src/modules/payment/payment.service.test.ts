import { describe, expect, it } from "vitest";
import { PaymentError, PaymentService, type OpenItemRow } from "./payment.service.js";
import { InMemoryPaymentRepository } from "../../repositories/in-memory-payment.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

function setup() {
  const items: OpenItemRow[] = [
    { id: "oi1", invoiceId: "i1", invoiceNumber: "RE-2026-0001", companyName: "Muster GmbH", openCents: 11900, grossCents: 11900, dueDate: new Date("2026-06-30"), dunningLevel: 0 },
  ];
  const repo = new InMemoryPaymentRepository(items);
  return { repo, svc: new PaymentService(repo, new MemAudit()) };
}

describe("PaymentService.record (Kap. 9.4)", () => {
  it("Teilzahlung mindert den offenen Betrag, Rechnung bleibt offen", async () => {
    const { svc } = setup();
    const r = await svc.record({ openItemId: "oi1", amountCents: 5000 });
    expect(r.newOpenCents).toBe(6900);
    expect(r.fullyPaid).toBe(false);
  });

  it("Vollzahlung setzt den offenen Betrag auf 0 → bezahlt", async () => {
    const { svc } = setup();
    const r = await svc.record({ openItemId: "oi1", amountCents: 11900 });
    expect(r.newOpenCents).toBe(0);
    expect(r.fullyPaid).toBe(true);
  });

  it("entfernt vollständig bezahlte Posten aus der offenen Liste", async () => {
    const { svc } = setup();
    await svc.record({ openItemId: "oi1", amountCents: 11900 });
    expect(await svc.listOpenItems()).toHaveLength(0);
  });

  it("lehnt Betrag ≤ 0 und unbekannte Posten ab", async () => {
    const { svc } = setup();
    await expect(svc.record({ openItemId: "oi1", amountCents: 0 })).rejects.toBeInstanceOf(PaymentError);
    await expect(svc.record({ openItemId: "nope", amountCents: 100 })).rejects.toBeInstanceOf(PaymentError);
  });
});

describe("PaymentService.assign — bestehende Zahlung auf OP zuordnen (Klärung auflösen)", () => {
  function setupAssign(paymentAmount = 11900) {
    const items: OpenItemRow[] = [
      { id: "oi1", invoiceId: "i1", invoiceNumber: "RE-2026-0001", companyName: "Muster GmbH", openCents: 11900, grossCents: 11900, dueDate: new Date("2026-06-30"), dunningLevel: 1 },
    ];
    const payments = [{ id: "pay1", amountCents: paymentAmount, allocations: [] as Array<{ openItemId: string; amountCents: number }>, matched: false }];
    const repo = new InMemoryPaymentRepository(items, payments);
    return { repo, svc: new PaymentService(repo, new MemAudit()) };
  }

  it("ordnet eine Vollzahlung zu → OP auf 0, Zahlung vollständig zugeordnet", async () => {
    const { repo, svc } = setupAssign(11900);
    const r = await svc.assign({ paymentId: "pay1", openItemId: "oi1" }); // ohne Betrag = offener Betrag
    expect(r.allocatedCents).toBe(11900);
    expect(r.newOpenCents).toBe(0);
    expect(r.paymentFullyMatched).toBe(true);
    expect(repo.payments[0]!.matched).toBe(true);
    // OP ist beglichen → faellt aus der offenen Liste (und damit aus dem Mahnlauf).
    expect(await svc.listOpenItems()).toHaveLength(0);
  });

  it("Teilzuordnung mindert den OP und laesst den Rest offen", async () => {
    const { svc } = setupAssign(5000);
    const r = await svc.assign({ paymentId: "pay1", openItemId: "oi1", amountCents: 5000 });
    expect(r.newOpenCents).toBe(6900);
    expect(r.paymentFullyMatched).toBe(true); // Zahlbetrag vollstaendig allokiert
  });

  it("lehnt mehr als den nicht zugeordneten Zahlbetrag ab", async () => {
    const { svc } = setupAssign(5000);
    await expect(svc.assign({ paymentId: "pay1", openItemId: "oi1", amountCents: 6000 })).rejects.toBeInstanceOf(PaymentError);
  });

  it("lehnt eine bereits vollstaendig zugeordnete Zahlung ab", async () => {
    const { svc } = setupAssign(5000);
    await svc.assign({ paymentId: "pay1", openItemId: "oi1", amountCents: 5000 });
    await expect(svc.assign({ paymentId: "pay1", openItemId: "oi1" })).rejects.toThrow();
  });

  it("wirft bei unbekannter Zahlung oder unbekanntem Posten", async () => {
    const { svc } = setupAssign();
    await expect(svc.assign({ paymentId: "nope", openItemId: "oi1" })).rejects.toBeInstanceOf(PaymentError);
    await expect(svc.assign({ paymentId: "pay1", openItemId: "nope" })).rejects.toBeInstanceOf(PaymentError);
  });
});
