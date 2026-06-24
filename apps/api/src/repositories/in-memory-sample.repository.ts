// In-Memory-Muster-Leihgut-Repository für Unit-Tests/Dev. Bildet Leihen, den
// Muster-Lagerstand (lager=MUSTER) und die Fristprüfung nach.

import { isSampleOverdue, type SampleLoanStatus } from "@texma/shared";
import type {
  LoanLine,
  OverdueSampleLoan,
  SampleInvoiceData,
  SampleLoanRepository,
  SampleLoanRow,
} from "../modules/sample/sample.service.js";

interface Loan {
  id: string;
  companyId: string;
  variantId: string | null;
  menge: number | null;
  zweck: string | null;
  ausgegebenAm: Date;
  status: SampleLoanStatus;
  invoiceId: string | null;
  quoteId: string | null;
  lines: LoanLine[];
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

  async list(): Promise<SampleLoanRow[]> {
    return [...this.loans.values()].map((l) => ({ ...l })).sort((a, b) => b.ausgegebenAm.getTime() - a.ausgegebenAm.getTime());
  }

  /** Test-Helfer: Angebot für „Angebot → Leihgut" hinterlegen. */
  setQuoteForLoan(quoteId: string, data: { companyId: string; lines: LoanLine[] }): void {
    this.quotes.set(quoteId, data);
  }
  private readonly quotes = new Map<string, { companyId: string; lines: LoanLine[] }>();

  async issue(input: {
    companyId: string;
    variantId: string;
    menge: number;
    ausgegebenAm: Date;
    dueDate: Date;
  }): Promise<{ id: string }> {
    const id = `loan-${++this.seq}`;
    this.loans.set(id, { id, companyId: input.companyId, variantId: input.variantId, menge: input.menge, zweck: null, ausgegebenAm: input.ausgegebenAm, status: "VERLIEHEN", invoiceId: null, quoteId: null, lines: [] });
    this.moveMuster(input.variantId, -input.menge); // Muster-Abgang
    return { id };
  }

  async issueMulti(input: { companyId: string; zweck: string | null; ausgegebenAm: Date; lines: LoanLine[]; quoteId?: string | null }): Promise<{ id: string }> {
    const id = `loan-${++this.seq}`;
    this.loans.set(id, { id, companyId: input.companyId, variantId: null, menge: null, zweck: input.zweck, ausgegebenAm: input.ausgegebenAm, status: "VERLIEHEN", invoiceId: null, quoteId: input.quoteId ?? null, lines: input.lines });
    for (const l of input.lines) if (l.variantId) this.moveMuster(l.variantId, -l.menge);
    return { id };
  }

  async quoteForLoan(quoteId: string): Promise<{ companyId: string; lines: LoanLine[] } | null> {
    return this.quotes.get(quoteId) ?? null;
  }

  async markReturned(loanId: string): Promise<void> {
    const loan = this.loans.get(loanId);
    if (!loan || loan.status !== "VERLIEHEN") return;
    loan.status = "ZURUECK";
    if (loan.variantId && loan.menge) this.moveMuster(loan.variantId, loan.menge); // Muster-Zugang
    for (const l of loan.lines) if (l.variantId) this.moveMuster(l.variantId, l.menge);
  }

  async listDueForBilling(now: Date): Promise<OverdueSampleLoan[]> {
    return [...this.loans.values()]
      .filter((l) => l.variantId !== null && l.menge !== null && isSampleOverdue({ ausgegebenAm: l.ausgegebenAm, status: l.status }, now))
      .map((l) => ({ id: l.id, companyId: l.companyId, variantId: l.variantId as string, menge: l.menge as number, ausgegebenAm: l.ausgegebenAm }));
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
