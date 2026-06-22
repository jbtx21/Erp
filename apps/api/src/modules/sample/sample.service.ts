// Muster-Leihgut (B5, Kap. 37.3). Ausgabe verbucht einen Muster-Abgang (F4-Ledger,
// lager=MUSTER) und legt eine 21-Tage-Wiedervorlage (DueItem) an. Wird ein Muster
// nicht zurückgegeben, erzeugt billOverdue() eine Musterrechnung zum Listenpreis
// (Menge × Listenpreis) mit einer Nummer aus dem Nummernkreis (F1). G1: Faktura,
// keine Buchung.

import { sampleDueDate, taxOnNet } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import { NumberingService } from "../numbering/numbering.service.js";

const VAT_RATE = 0.19;

export interface SampleInvoiceData {
  number: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
}

export interface OverdueSampleLoan {
  id: string;
  companyId: string;
  variantId: string;
  menge: number;
  ausgegebenAm: Date;
}

export interface SampleLoanRow {
  id: string;
  companyId: string;
  variantId: string;
  menge: number;
  ausgegebenAm: Date;
  status: string;
  invoiceId: string | null;
}

export interface SampleLoanRepository {
  /** Alle Muster-Leihen (neueste zuerst). */
  list(): Promise<SampleLoanRow[]>;
  /** Legt die Leihe an, bucht den Muster-Abgang (−menge) und die DueItem-Frist. */
  issue(input: {
    companyId: string;
    variantId: string;
    menge: number;
    ausgegebenAm: Date;
    dueDate: Date;
  }): Promise<{ id: string }>;
  /** Rückgabe: Status ZURUECK, Muster-Zugang (+menge), DueItem erledigt. */
  markReturned(loanId: string): Promise<void>;
  /** Noch verliehene Leihen, deren Frist `now` erreicht/überschritten hat. */
  listDueForBilling(now: Date): Promise<OverdueSampleLoan[]>;
  /** Listenpreis (netto) für Menge × Variante in der Preisgruppe der Firma. */
  listPriceCents(companyId: string, variantId: string, menge: number): Promise<number>;
  /** Erzeugt die Musterrechnung, setzt Status BERECHNET + invoiceId, DueItem erledigt. */
  bill(loanId: string, invoice: SampleInvoiceData): Promise<{ invoiceId: string }>;
}

export interface BilledSample {
  loanId: string;
  invoiceNumber: string;
  netCents: number;
}

export interface FailedSample {
  loanId: string;
  reason: string;
}

export interface BillingRunResult {
  billed: BilledSample[];
  /** Leihen, die in diesem Lauf nicht berechnet werden konnten (z. B. fehlender Preis). */
  failed: FailedSample[];
}

export class SampleLoanService {
  constructor(
    private readonly repo: SampleLoanRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  /** Alle Muster-Leihen (neueste zuerst). */
  async list(): Promise<SampleLoanRow[]> {
    return this.repo.list();
  }

  /** Gibt ein Muster aus (Leihe + Muster-Abgang + 21-Tage-Wiedervorlage). */
  async issue(input: {
    companyId: string;
    variantId: string;
    menge: number;
    at?: Date;
  }): Promise<{ id: string }> {
    if (!Number.isInteger(input.menge) || input.menge <= 0) {
      throw new Error("menge must be a positive integer");
    }
    const ausgegebenAm = input.at ?? new Date();
    const loan = await this.repo.issue({
      companyId: input.companyId,
      variantId: input.variantId,
      menge: input.menge,
      ausgegebenAm,
      dueDate: sampleDueDate(ausgegebenAm),
    });
    await this.audit.append(
      buildEntry({
        entity: "SampleLoan",
        entityId: loan.id,
        action: "CREATE",
        after: { companyId: input.companyId, variantId: input.variantId, menge: input.menge },
      })
    );
    return loan;
  }

  /** Muster zurückgenommen — keine Berechnung mehr. */
  async returnSample(loanId: string): Promise<void> {
    await this.repo.markReturned(loanId);
    await this.audit.append(
      buildEntry({ entity: "SampleLoan", entityId: loanId, action: "UPDATE", after: { status: "ZURUECK" } })
    );
  }

  /** Berechnet alle überfälligen Muster zum Listenpreis (21-Tage-Automatik). */
  async billOverdue(now: Date = new Date()): Promise<BillingRunResult> {
    const due = await this.repo.listDueForBilling(now);
    const billed: BilledSample[] = [];
    const failed: FailedSample[] = [];
    for (const loan of due) {
      try {
        // Preis ZUERST ermitteln — schlägt das fehl (fehlende Preispflege), wird KEINE
        // Belegnummer verbraucht (Nummernkreis bleibt lückenlos, F1).
        const netCents = await this.repo.listPriceCents(loan.companyId, loan.variantId, loan.menge);
        const number = await this.numbering.next("INVOICE", now);
        const taxCents = taxOnNet(netCents, VAT_RATE);
        const grossCents = netCents + taxCents;
        const { invoiceId } = await this.repo.bill(loan.id, { number, netCents, taxCents, grossCents });
        await this.audit.append(
          buildEntry({
            entity: "Invoice",
            entityId: invoiceId,
            action: "CREATE",
            after: { number, netCents, grossCents, grund: "Musterrechnung", sampleLoanId: loan.id },
          })
        );
        billed.push({ loanId: loan.id, invoiceNumber: number, netCents });
      } catch (e) {
        // Eine fehlerhafte Leihe darf den Gesamtlauf nicht abbrechen.
        failed.push({ loanId: loan.id, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    return { billed, failed };
  }
}
