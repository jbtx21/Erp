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
}

export class PaymentError extends Error {}

export interface RecordPaymentResult {
  openItemId: string;
  newOpenCents: number;
  fullyPaid: boolean;
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
}
