import { describe, expect, it } from "vitest";
import { matchPayments, type IncomingPayment, type OpenItemRef } from "./banking-match.js";

const openItems: OpenItemRef[] = [
  { id: "oi-1", invoiceNumber: "RE-2026-001", openCents: 11900 },
  { id: "oi-2", invoiceNumber: "RE-2026-002", openCents: 5000 },
];

describe("Banking-Abgleich (T-13)", () => {
  it("ordnet eine Zahlung über die Rechnungsnummer im Verwendungszweck zu", () => {
    const payments: IncomingPayment[] = [
      { id: "p-1", reference: "Zahlung Rechnung RE-2026-001", amountCents: 11900 },
    ];
    const { allocations, clarifications } = matchPayments(payments, openItems);
    expect(allocations).toEqual([
      { paymentId: "p-1", openItemId: "oi-1", allocatedCents: 11900 },
    ]);
    expect(clarifications).toHaveLength(0);
  });

  it("bucht Teilzahlungen und lässt den OP offen", () => {
    const payments: IncomingPayment[] = [
      { id: "p-1", reference: "RE-2026-001 Teilzahlung", amountCents: 5000 },
    ];
    const { allocations } = matchPayments(payments, openItems);
    expect(allocations[0]?.allocatedCents).toBe(5000);
  });

  it("setzt Überzahlung auf die Klärungsliste", () => {
    const payments: IncomingPayment[] = [
      { id: "p-1", reference: "RE-2026-002", amountCents: 6000 },
    ];
    const { allocations, clarifications } = matchPayments(payments, openItems);
    expect(allocations[0]?.allocatedCents).toBe(5000);
    expect(clarifications).toEqual([
      { paymentId: "p-1", reason: "UEBERZAHLUNG", unallocatedCents: 1000 },
    ]);
  });

  it("meldet unklare Zahlungen ohne erkennbare Rechnung", () => {
    const payments: IncomingPayment[] = [
      { id: "p-1", reference: "Sammelüberweisung Juni", amountCents: 9999 },
    ];
    const { clarifications } = matchPayments(payments, openItems);
    expect(clarifications[0]?.reason).toBe("KEINE_RECHNUNG_ERKANNT");
  });

  it("verteilt zwei Zahlungen auf zwei OPs (Restbeträge fortgeschrieben)", () => {
    const payments: IncomingPayment[] = [
      { id: "p-1", reference: "RE-2026-001", amountCents: 11900 },
      { id: "p-2", reference: "RE-2026-002", amountCents: 5000 },
    ];
    const { allocations, clarifications } = matchPayments(payments, openItems);
    expect(allocations).toHaveLength(2);
    expect(clarifications).toHaveLength(0);
  });
});
