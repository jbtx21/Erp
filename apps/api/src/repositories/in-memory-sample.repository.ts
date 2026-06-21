// In-Memory-Muster-Leihgut-Repository für Unit-Tests/Dev. Bildet Leihen, den
// Muster-Lagerstand (lager=MUSTER) und die Fristprüfung nach.

import { isSampleOverdue, type SampleLoanStatus } from "@texma/shared";
import type {
  OverdueSampleLoan,
  SampleInvoiceData,
  SampleLoanRepository,
} from "../modules/sample/sample.service.js";

interface Loan {
  id: string;
  companyId: string;
  variantId: string;
  menge: number;
  ausgegebenAm: Date;
  status: SampleLoanStatus;
  invoiceId: string | null;
}

export class InMemorySampleLoanRepository implements SampleLoanRepository {
  private readonly loans = new Map<string, Loan>();
  private readonly unitListCents = new Map<string, number>();
  /** Muster-Lagerstand je Variante (lager=MUSTER), als Summe der Bewegungen. */
  readonly musterStock = new Map<string, number>();
  private seq = 0;

  /** Test-Helfer: Listen-Einzelpreis je Variante setzen. */
  setUnitListCents(variantId: string, cents: number): void {
    this.unitListCents.set(variantId, cents);
  }

  private moveMuster(variantId: string, delta: number): void {
    this.musterStock.set(variantId, (this.musterStock.get(variantId) ?? 0) + delta);
  }

  async issue(input: {
    companyId: string;
    variantId: string;
    menge: number;
    ausgegebenAm: Date;
    dueDate: Date;
  }): Promise<{ id: string }> {
    const id = `loan-${++this.seq}`;
    this.loans.set(id, { id, ...input, status: "VERLIEHEN", invoiceId: null });
    this.moveMuster(input.variantId, -input.menge); // Muster-Abgang
    return { id };
  }

  async markReturned(loanId: string): Promise<void> {
    const loan = this.loans.get(loanId);
    if (!loan || loan.status !== "VERLIEHEN") return;
    loan.status = "ZURUECK";
    this.moveMuster(loan.variantId, loan.menge); // Muster-Zugang
  }

  async listDueForBilling(now: Date): Promise<OverdueSampleLoan[]> {
    return [...this.loans.values()]
      .filter((l) => isSampleOverdue({ ausgegebenAm: l.ausgegebenAm, status: l.status }, now))
      .map((l) => ({ id: l.id, companyId: l.companyId, variantId: l.variantId, menge: l.menge, ausgegebenAm: l.ausgegebenAm }));
  }

  async listPriceCents(_companyId: string, variantId: string, menge: number): Promise<number> {
    return (this.unitListCents.get(variantId) ?? 0) * menge;
  }

  async bill(loanId: string, invoice: SampleInvoiceData): Promise<{ invoiceId: string }> {
    const loan = this.loans.get(loanId);
    if (!loan) throw new Error(`SampleLoan ${loanId} nicht gefunden`);
    const invoiceId = `inv-${invoice.number}`;
    loan.status = "BERECHNET";
    loan.invoiceId = invoiceId;
    return { invoiceId };
  }
}
