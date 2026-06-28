// Manuelle Zahlungserfassung (Kap. 9.4): Zahlungseingang von Hand auf einen offenen
// Posten buchen — für Zahlungen, die nicht über den automatischen CAMT-Bankabgleich
// (T-13) zugeordnet werden (Barzahlung, manuelle Überweisungszuordnung, Teilzahlung).
// Reduziert den offenen Betrag; bei 0 gilt die Rechnung als bezahlt. GoBD-Audit.

import { buildEntry, type AuditSink } from "@texma/audit";

export interface OpenItemRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  companyName: string;
  openCents: number;
  grossCents: number;
  dueDate: Date;
  dunningLevel: number;
}

export interface RecordPaymentInput {
  openItemId: string;
  amountCents: number;
  bookedAt?: Date;
  reference?: string;
}

export interface PaymentRepository {
  /** Offene Posten (openCents > 0) mit Rechnungs-/Firmenbezug. */
  listOpenItems(): Promise<OpenItemRow[]>;
  getOpenItem(openItemId: string): Promise<{ id: string; openCents: number } | null>;
  /** Bucht Zahlung + Allokation und mindert den offenen Betrag; liefert den neuen Restbetrag. */
  recordPayment(input: { openItemId: string; amountCents: number; bookedAt: Date; reference: string | null }): Promise<{ newOpenCents: number }>;
  /** Zahlungseingang (Betrag + bereits zugeordnete Summe) für die manuelle Zuordnung; null = unbekannt. */
  getPaymentForAssign(paymentId: string): Promise<{ amountCents: number; allocatedCents: number } | null>;
  /** Ordnet einen bestehenden Zahlungseingang einem OP zu (Allokation + openCents mindern + matched neu). */
  assignPaymentToOpenItem(input: { paymentId: string; openItemId: string; amountCents: number }): Promise<{ newOpenCents: number; paymentFullyMatched: boolean }>;
}

export class PaymentError extends Error {}

export interface RecordPaymentResult {
  openItemId: string;
  newOpenCents: number;
  fullyPaid: boolean;
}

export interface AssignPaymentInput {
  paymentId: string;
  openItemId: string;
  /** Zuordnungsbetrag; ohne Angabe = offener Betrag, höchstens der noch nicht zugeordnete Zahlbetrag. */
  amountCents?: number;
}

export interface AssignPaymentResult {
  paymentId: string;
  openItemId: string;
  allocatedCents: number;
  newOpenCents: number;
  /** Zahlungseingang vollständig zugeordnet (keine Klärung mehr). */
  paymentFullyMatched: boolean;
}

export class PaymentService {
  constructor(private readonly repo: PaymentRepository, private readonly audit: AuditSink) {}

  listOpenItems(): Promise<OpenItemRow[]> {
    return this.repo.listOpenItems();
  }

  /** Bucht einen manuellen Zahlungseingang auf einen offenen Posten (Teil-/Voll-/Überzahlung). */
  async record(input: RecordPaymentInput): Promise<RecordPaymentResult> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new PaymentError("Der Zahlbetrag muss größer als 0 sein.");
    }
    const oi = await this.repo.getOpenItem(input.openItemId);
    if (!oi) throw new PaymentError(`Offener Posten ${input.openItemId} nicht gefunden.`);

    const { newOpenCents } = await this.repo.recordPayment({
      openItemId: input.openItemId,
      amountCents: input.amountCents,
      bookedAt: input.bookedAt ?? new Date(),
      reference: input.reference?.trim() || null,
    });

    await this.audit.append(buildEntry({
      entity: "Payment", entityId: input.openItemId, action: "CREATE",
      after: { openItemId: input.openItemId, amountCents: input.amountCents, newOpenCents, manuell: true },
    }));
    return { openItemId: input.openItemId, newOpenCents, fullyPaid: newOpenCents <= 0 };
  }

  /**
   * Ordnet einen bereits erfassten Zahlungseingang (z. B. aus dem CAMT-/Provider-Import, der
   * automatisch nicht zugeordnet werden konnte → Klärung) manuell einem offenen Posten zu.
   * Anders als `record` legt das KEINE neue Zahlung an (keine Doppelbuchung) — es allokiert die
   * vorhandene Zahlung, mindert den offenen Betrag und nimmt den Eingang aus der Klärung (matched).
   */
  async assign(input: AssignPaymentInput): Promise<AssignPaymentResult> {
    const pay = await this.repo.getPaymentForAssign(input.paymentId);
    if (!pay) throw new PaymentError(`Zahlungseingang ${input.paymentId} nicht gefunden.`);
    const unallocated = pay.amountCents - pay.allocatedCents;
    if (unallocated <= 0) throw new PaymentError("Dieser Zahlungseingang ist bereits vollständig zugeordnet.");

    const oi = await this.repo.getOpenItem(input.openItemId);
    if (!oi) throw new PaymentError(`Offener Posten ${input.openItemId} nicht gefunden.`);

    // Standard: den offenen Betrag begleichen, höchstens aber den noch nicht zugeordneten Zahlbetrag.
    const allocate = input.amountCents ?? Math.min(unallocated, Math.max(oi.openCents, 0));
    if (!Number.isInteger(allocate) || allocate <= 0) throw new PaymentError("Der Zuordnungsbetrag muss größer als 0 sein.");
    if (allocate > unallocated) throw new PaymentError(`Es können höchstens ${(unallocated / 100).toFixed(2)} € zugeordnet werden (nicht zugeordneter Zahlbetrag).`);

    const res = await this.repo.assignPaymentToOpenItem({ paymentId: input.paymentId, openItemId: input.openItemId, amountCents: allocate });

    await this.audit.append(buildEntry({
      entity: "Payment", entityId: input.paymentId, action: "UPDATE",
      after: { zugeordnetAuf: input.openItemId, amountCents: allocate, newOpenCents: res.newOpenCents, matched: res.paymentFullyMatched },
    }));
    return { paymentId: input.paymentId, openItemId: input.openItemId, allocatedCents: allocate, newOpenCents: res.newOpenCents, paymentFullyMatched: res.paymentFullyMatched };
  }
}
