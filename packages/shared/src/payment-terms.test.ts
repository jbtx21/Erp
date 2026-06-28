import { describe, expect, it } from "vitest";
import { computePaymentSchedule, isSkontoAvailable, paymentProposal } from "./payment-terms.js";

const ISSUE = new Date(Date.UTC(2026, 2, 1)); // 01.03.2026

describe("computePaymentSchedule (Skonto + Fälligkeit)", () => {
  it("Nettofälligkeit ohne Skonto = Rechnungsdatum + Zahlungsziel", () => {
    const s = computePaymentSchedule(ISSUE, 11900, { zahlungszielTage: 14 });
    expect(s.dueDate).toEqual(new Date(Date.UTC(2026, 2, 15)));
    expect(s.skontoUntil).toBeNull();
    expect(s.recommendedAmountCents).toBe(11900);
    expect(s.recommendedPayDate).toEqual(s.dueDate);
  });

  it("rechnet Skonto auf den Bruttobetrag und empfiehlt die Skontofrist", () => {
    // 2 % Skonto auf 119,00 € = 2,38 € → zahlbar 116,62 €; Frist 01.03. + 7 = 08.03.
    const s = computePaymentSchedule(ISSUE, 11900, { zahlungszielTage: 30, skontoPercent: 2, skontoDays: 7 });
    expect(s.skontoPercent).toBe(2);
    expect(s.skontoSavingCents).toBe(238);
    expect(s.skontoPayableCents).toBe(11662);
    expect(s.skontoUntil).toEqual(new Date(Date.UTC(2026, 2, 8)));
    expect(s.recommendedPayDate).toEqual(s.skontoUntil);
    expect(s.recommendedAmountCents).toBe(11662);
    expect(s.dueDate).toEqual(new Date(Date.UTC(2026, 2, 31)));
  });

  it("ignoriert Skonto, wenn Satz oder Frist fehlt", () => {
    expect(computePaymentSchedule(ISSUE, 1000, { zahlungszielTage: 14, skontoPercent: 2, skontoDays: 0 }).skontoUntil).toBeNull();
    expect(computePaymentSchedule(ISSUE, 1000, { zahlungszielTage: 14, skontoPercent: 0, skontoDays: 7 }).skontoUntil).toBeNull();
  });
});

describe("paymentProposal (Zahlung bis Zahlungsziel / Skonto)", () => {
  const s = computePaymentSchedule(ISSUE, 11900, { zahlungszielTage: 30, skontoPercent: 3, skontoDays: 10 });

  it("innerhalb der Skontofrist → Skontobetrag zur Skontofrist", () => {
    const p = paymentProposal(s, 11900, new Date(Date.UTC(2026, 2, 5)));
    expect(p.withSkonto).toBe(true);
    expect(p.amountCents).toBe(s.skontoPayableCents);
    expect(p.payDate).toEqual(s.skontoUntil);
  });

  it("nach der Skontofrist → voller Betrag zur Nettofälligkeit", () => {
    const p = paymentProposal(s, 11900, new Date(Date.UTC(2026, 2, 20)));
    expect(p.withSkonto).toBe(false);
    expect(p.amountCents).toBe(11900);
    expect(p.payDate).toEqual(s.dueDate);
  });

  it("isSkontoAvailable am letzten Skontotag noch true", () => {
    expect(isSkontoAvailable(s, s.skontoUntil!)).toBe(true);
    expect(isSkontoAvailable(s, new Date(s.skontoUntil!.getTime() + 1))).toBe(false);
  });
});
