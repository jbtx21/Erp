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
