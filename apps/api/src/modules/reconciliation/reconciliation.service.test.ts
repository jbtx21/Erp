import { describe, expect, it } from "vitest";
import { ReconciliationService, type ReconciliationRepository, type ReconPaymentRow, type ReconOpenItemRow } from "./reconciliation.service.js";

function repo(payments: ReconPaymentRow[], openItems: ReconOpenItemRow[]): ReconciliationRepository {
  return { listPayments: async () => payments, listOpenItems: async () => openItems };
}

const asOf = () => new Date("2026-06-25T00:00:00Z");

describe("ReconciliationService (vereinheitlichter Abgleich)", () => {
  it("leitet Herkunft + Abgleich-Status je Zahlung ab", async () => {
    const svc = new ReconciliationService(repo([
      { id: "p1", source: "CAMT", externalRef: "ref1", reference: "RE-1", amountCents: 10000, bookedAt: asOf(),
        allocations: [{ openItemId: "oi1", invoiceNumber: "RE-1", companyName: "Müller", amountCents: 10000 }] },
      { id: "p2", source: "MANUAL", externalRef: null, reference: null, amountCents: 5000, bookedAt: asOf(),
        allocations: [{ openItemId: "oi2", invoiceNumber: "RE-2", companyName: "Meier", amountCents: 3000 }] },
      { id: "p3", source: "PROVIDER", externalRef: "ref3", reference: "?", amountCents: 2000, bookedAt: asOf(), allocations: [] },
    ], []), asOf);
    const { matches, summary } = await svc.overview();
    expect(matches.find((m) => m.id === "p1")?.status).toBe("ZUGEORDNET");
    expect(matches.find((m) => m.id === "p2")?.status).toBe("TEILZUGEORDNET");
    expect(matches.find((m) => m.id === "p3")?.status).toBe("KLAERUNG");
    expect(summary.bySource).toEqual({ CAMT: 1, PROVIDER: 1, MANUAL: 1 });
    expect(summary.byStatus).toEqual({ ZUGEORDNET: 1, TEILZUGEORDNET: 1, KLAERUNG: 1 });
  });

  it("bildet OP-Aging + Überfälligkeitssumme im selben Modell ab", async () => {
    const svc = new ReconciliationService(repo([], [
      { id: "oi1", invoiceNumber: "RE-1", companyName: "Müller", openCents: 10000, grossCents: 10000, dueDate: new Date("2026-06-15T00:00:00Z"), dunningLevel: 1 },
      { id: "oi2", invoiceNumber: "RE-2", companyName: "Meier", openCents: 5000, grossCents: 5000, dueDate: new Date("2026-07-10T00:00:00Z"), dunningLevel: 0 },
    ]), asOf);
    const { openItems, summary } = await svc.overview();
    expect(openItems.find((o) => o.id === "oi1")?.bucket).toBe("FAELLIG_0_30");
    expect(openItems.find((o) => o.id === "oi2")?.bucket).toBe("NICHT_FAELLIG");
    expect(summary.openTotalCents).toBe(15000);
    expect(summary.overdueTotalCents).toBe(10000);
  });
});
