// Zahlungskonditionen Eingangsrechnung (Kap. 9.4): Nettofälligkeit + Skonto-Frist/-Betrag
// aus Rechnungsdatum + Lieferanten-Konditionen. Reine, IO-freie Logik — Grundlage für den
// Zahllauf (Zahlung bis Zahlungsziel bzw. innerhalb der Skontofrist mit Abzug).

import type { Cents } from "./money.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PaymentTerms {
  /** Nettozahlungsziel in Tagen ab Rechnungsdatum. */
  zahlungszielTage: number;
  /** Skonto-Prozentsatz (z. B. 2). null/0 = kein Skonto. */
  skontoPercent?: number | null;
  /** Skonto-Frist in Tagen ab Rechnungsdatum. null/0 = kein Skonto. */
  skontoDays?: number | null;
}

export interface PaymentSchedule {
  /** Nettofälligkeit = Rechnungsdatum + Zahlungsziel. */
  dueDate: Date;
  /** Letzter Tag mit Skontoabzug (Rechnungsdatum + Skontofrist); null = kein Skonto. */
  skontoUntil: Date | null;
  /** Wirksamer Skontosatz (0, wenn kein Skonto gepflegt). */
  skontoPercent: number;
  /** Skonto-Ersparnis auf den Bruttobetrag (Cent). */
  skontoSavingCents: Cents;
  /** Zu zahlender Betrag bei Skontoabzug (Brutto − Ersparnis). */
  skontoPayableCents: Cents;
  /** Empfohlenes Zahldatum: Skontofrist, wenn Skonto vorhanden, sonst Nettofälligkeit. */
  recommendedPayDate: Date;
  /** Empfohlener Zahlbetrag: mit Skonto, wenn vorhanden, sonst Brutto. */
  recommendedAmountCents: Cents;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/**
 * Berechnet Fälligkeit + Skonto einer Eingangsrechnung. Skonto greift nur, wenn Satz UND
 * Frist gepflegt sind; der Skontobetrag wird auf den Bruttobetrag gerechnet (kaufmännisch
 * gerundet). Ohne Skonto: Zahlung zur Nettofälligkeit über den vollen Betrag.
 */
export function computePaymentSchedule(issueDate: Date, grossCents: Cents, terms: PaymentTerms): PaymentSchedule {
  const dueDate = addDays(issueDate, terms.zahlungszielTage);
  const hasSkonto = !!terms.skontoPercent && terms.skontoPercent > 0 && !!terms.skontoDays && terms.skontoDays > 0;

  if (!hasSkonto) {
    return {
      dueDate, skontoUntil: null, skontoPercent: 0, skontoSavingCents: 0, skontoPayableCents: grossCents,
      recommendedPayDate: dueDate, recommendedAmountCents: grossCents,
    };
  }

  const skontoPercent = terms.skontoPercent!;
  const skontoUntil = addDays(issueDate, terms.skontoDays!);
  const skontoSavingCents = Math.round((grossCents * skontoPercent) / 100);
  const skontoPayableCents = grossCents - skontoSavingCents;
  return {
    dueDate, skontoUntil, skontoPercent, skontoSavingCents, skontoPayableCents,
    recommendedPayDate: skontoUntil, recommendedAmountCents: skontoPayableCents,
  };
}

/** Ist der Skontoabzug am Stichtag noch möglich (≤ Skontofrist)? */
export function isSkontoAvailable(schedule: PaymentSchedule, asOf: Date): boolean {
  return schedule.skontoUntil != null && asOf.getTime() <= schedule.skontoUntil.getTime();
}

/**
 * Wählt Zahldatum + -betrag zum Stichtag: innerhalb der Skontofrist mit Abzug, sonst der
 * volle Betrag zur Nettofälligkeit. Basis für den Zahllauf (terminierte SEPA-Überweisung).
 */
export function paymentProposal(schedule: PaymentSchedule, grossCents: Cents, asOf: Date): { payDate: Date; amountCents: Cents; withSkonto: boolean } {
  if (isSkontoAvailable(schedule, asOf)) {
    return { payDate: schedule.skontoUntil!, amountCents: schedule.skontoPayableCents, withSkonto: true };
  }
  return { payDate: schedule.dueDate, amountCents: grossCents, withSkonto: false };
}
