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

describe("Banking-Abgleich — Sammelzahlung & Mehrfachallokation", () => {
  const openItems: OpenItemRef[] = [
    { id: "oi-1", invoiceNumber: "RE-2026-001", openCents: 11900, debtorName: "Edeka Rentschler GmbH" },
    { id: "oi-2", invoiceNumber: "RE-2026-002", openCents: 5000, debtorName: "Edeka Rentschler GmbH" },
  ];

  it("verteilt EINE Sammelzahlung über mehrere im Zweck benannte OPs (FIFO)", () => {
    const payments: IncomingPayment[] = [
      { id: "p-1", reference: "Sammelzahlung RE-2026-001 + RE-2026-002", amountCents: 16900 },
    ];
    const { allocations, clarifications } = matchPayments(payments, openItems);
    expect(clarifications).toHaveLength(0);
    expect(allocations).toEqual(
      expect.arrayContaining([
        { paymentId: "p-1", openItemId: "oi-1", allocatedCents: 11900 },
        { paymentId: "p-1", openItemId: "oi-2", allocatedCents: 5000 },
      ])
    );
    expect(allocations).toHaveLength(2);
  });

  it("verteilt eine zu kleine Sammelzahlung FIFO (Rest-OP bleibt teil-offen)", () => {
    const payments: IncomingPayment[] = [
      { id: "p-1", reference: "RE-2026-001 RE-2026-002", amountCents: 14000 },
    ];
    const { allocations, clarifications } = matchPayments(payments, openItems);
    expect(clarifications).toHaveLength(0);
    // FIFO ohne dueDate ⇒ kleinerer Restbetrag zuerst: oi-2 (5000) voll, oi-1 (11900) teilweise 9000.
    const byOi = Object.fromEntries(allocations.map((a) => [a.openItemId, a.allocatedCents]));
    expect(byOi["oi-2"]).toBe(5000);
    expect(byOi["oi-1"]).toBe(9000);
  });

  it("respektiert dueDate-FIFO bei der Sammelzahlung", () => {
    const dated: OpenItemRef[] = [
      { id: "a", invoiceNumber: "RE-A", openCents: 6000, dueDate: new Date("2026-01-10") },
      { id: "b", invoiceNumber: "RE-B", openCents: 6000, dueDate: new Date("2026-02-10") },
    ];
    const { allocations } = matchPayments(
      [{ id: "p", reference: "RE-A RE-B", amountCents: 9000 }],
      dated
    );
    const byOi = Object.fromEntries(allocations.map((a) => [a.openItemId, a.allocatedCents]));
    expect(byOi["a"]).toBe(6000); // früher fällig zuerst voll
    expect(byOi["b"]).toBe(3000);
  });

  it("meldet MEHRDEUTIG, wenn eine Nummer Teilstring einer anderen ist", () => {
    const ambiguous: OpenItemRef[] = [
      { id: "x", invoiceNumber: "RE-1", openCents: 1000 },
      { id: "y", invoiceNumber: "RE-10", openCents: 2000 },
    ];
    const { allocations, clarifications } = matchPayments(
      [{ id: "p", reference: "Zahlung RE-10", amountCents: 2000 }],
      ambiguous
    );
    expect(allocations).toHaveLength(0);
    expect(clarifications[0]?.reason).toBe("MEHRDEUTIG");
  });
});

describe("Banking-Abgleich — Skonto-Toleranz", () => {
  const openItems: OpenItemRef[] = [{ id: "oi-1", invoiceNumber: "RE-2026-001", openCents: 10000 }];

  it("schließt den OP mit Skonto, wenn die Zahlung knapp darunter liegt (3 %)", () => {
    const { allocations, clarifications } = matchPayments(
      [{ id: "p", reference: "RE-2026-001", amountCents: 9700 }],
      openItems
    );
    expect(clarifications).toHaveLength(0);
    expect(allocations[0]).toEqual({ paymentId: "p", openItemId: "oi-1", allocatedCents: 9700, skontoCents: 300 });
  });

  it("bleibt Teilzahlung, wenn die Differenz die Skonto-Toleranz übersteigt", () => {
    const { allocations } = matchPayments(
      [{ id: "p", reference: "RE-2026-001", amountCents: 9000 }],
      openItems
    );
    expect(allocations[0]?.allocatedCents).toBe(9000);
    expect(allocations[0]?.skontoCents).toBeUndefined();
  });

  it("respektiert eine engere Toleranz über die Optionen", () => {
    const { allocations } = matchPayments(
      [{ id: "p", reference: "RE-2026-001", amountCents: 9700 }],
      openItems,
      { skontoToleranceBps: 100 } // 1 % = 100 ct < 300 ct Gap ⇒ keine Skonto-Schließung
    );
    expect(allocations[0]?.allocatedCents).toBe(9700);
    expect(allocations[0]?.skontoCents).toBeUndefined();
  });
});

describe("Banking-Abgleich — 2. Stufe: Debitor + Betrag", () => {
  const openItems: OpenItemRef[] = [
    { id: "oi-1", invoiceNumber: "RE-2026-001", openCents: 11900, debtorName: "Farverig ApS" },
    { id: "oi-2", invoiceNumber: "RE-2026-077", openCents: 5000, debtorName: "Edeka Rentschler GmbH" },
  ];

  it("ordnet ohne Rechnungsnummer über Name + exakten Betrag zu", () => {
    const { allocations, clarifications } = matchPayments(
      [{ id: "p", reference: "Ueberweisung ohne Zweck", amountCents: 11900, payerName: "FARVERIG APS" }],
      openItems
    );
    expect(clarifications).toHaveLength(0);
    expect(allocations[0]).toMatchObject({ openItemId: "oi-1", allocatedCents: 11900 });
  });

  it("ordnet über Name + Betrag mit Skonto zu", () => {
    const { allocations, clarifications } = matchPayments(
      [{ id: "p", reference: "-", amountCents: 11543, payerName: "Farverig" }],
      openItems
    );
    expect(clarifications).toHaveLength(0);
    expect(allocations[0]).toMatchObject({ openItemId: "oi-1", allocatedCents: 11543, skontoCents: 357 });
  });

  it("bleibt Klärung, wenn weder Nummer noch Name/Betrag passen", () => {
    const { clarifications } = matchPayments(
      [{ id: "p", reference: "-", amountCents: 9999, payerName: "Unbekannt GmbH" }],
      openItems
    );
    expect(clarifications[0]?.reason).toBe("KEINE_RECHNUNG_ERKANNT");
  });
});
