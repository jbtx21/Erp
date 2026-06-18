// Banking-Abgleich — Kap. 9.4. Testfall T-13.
// Eingehende Zahlungen (CAMT.053/MT940/FinTS) werden gegen offene Posten
// abgeglichen: Treffer über Rechnungsnummer im Verwendungszweck + Betrag.
// Nicht eindeutig zuordenbare Zahlungen kommen auf die Klärungsliste.

import type { Cents } from "./money.js";

export interface OpenItemRef {
  id: string;
  invoiceNumber: string;
  openCents: Cents;
}

export interface IncomingPayment {
  id: string;
  /** Verwendungszweck (enthält idealerweise die Rechnungsnummer). */
  reference: string;
  amountCents: Cents;
}

export interface MatchAllocation {
  paymentId: string;
  openItemId: string;
  allocatedCents: Cents;
}

export type ClarificationReason =
  | "KEINE_RECHNUNG_ERKANNT"
  | "MEHRDEUTIG"
  | "UEBERZAHLUNG";

export interface ClarificationItem {
  paymentId: string;
  reason: ClarificationReason;
  /** Nicht zugeordneter Restbetrag (bei Überzahlung > 0). */
  unallocatedCents: Cents;
}

export interface MatchResult {
  allocations: MatchAllocation[];
  clarifications: ClarificationItem[];
}

/** Findet offene Posten, deren Rechnungsnummer im Verwendungszweck vorkommt. */
function findCandidates(
  payment: IncomingPayment,
  openItems: ReadonlyArray<OpenItemRef>
): OpenItemRef[] {
  const ref = payment.reference.toUpperCase();
  return openItems.filter((oi) => ref.includes(oi.invoiceNumber.toUpperCase()));
}

/**
 * Gleicht eine Liste Zahlungen gegen offene Posten ab (T-13).
 * - genau ein Treffer → Allokation (Teilzahlung möglich); Rest bei Überzahlung
 *   landet als UEBERZAHLUNG auf der Klärungsliste.
 * - kein Treffer → KEINE_RECHNUNG_ERKANNT.
 * - mehrere Treffer → MEHRDEUTIG (keine automatische Zuordnung).
 * Offene Posten werden über alle Zahlungen hinweg fortgeschrieben (mutiert nicht
 * die Eingabe — arbeitet auf einer Kopie der Restbeträge).
 */
export function matchPayments(
  payments: ReadonlyArray<IncomingPayment>,
  openItems: ReadonlyArray<OpenItemRef>
): MatchResult {
  const remaining = new Map(openItems.map((oi) => [oi.id, oi.openCents]));
  const allocations: MatchAllocation[] = [];
  const clarifications: ClarificationItem[] = [];

  for (const p of payments) {
    const candidates = findCandidates(p, openItems).filter(
      (oi) => (remaining.get(oi.id) ?? 0) > 0
    );

    if (candidates.length === 0) {
      clarifications.push({
        paymentId: p.id,
        reason: "KEINE_RECHNUNG_ERKANNT",
        unallocatedCents: p.amountCents,
      });
      continue;
    }
    if (candidates.length > 1) {
      clarifications.push({
        paymentId: p.id,
        reason: "MEHRDEUTIG",
        unallocatedCents: p.amountCents,
      });
      continue;
    }

    const oi = candidates[0] as OpenItemRef;
    const open = remaining.get(oi.id) ?? 0;
    const allocated = Math.min(open, p.amountCents);
    allocations.push({ paymentId: p.id, openItemId: oi.id, allocatedCents: allocated });
    remaining.set(oi.id, open - allocated);

    const overpay = p.amountCents - allocated;
    if (overpay > 0) {
      clarifications.push({
        paymentId: p.id,
        reason: "UEBERZAHLUNG",
        unallocatedCents: overpay,
      });
    }
  }

  return { allocations, clarifications };
}
