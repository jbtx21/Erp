// In-Memory-Implementierung der Banking-Repositories — für Tests/lokale Durchstiche.
// Bildet OP-Restbeträge, Idempotenz über externalRef und die Klärungsliste ab.

import type { OpenItemRef } from "@texma/shared";
import type {
  BankingRepository,
  PersistablePayment,
} from "../modules/banking/banking-import.service.js";
import type { BankingClarificationItem, BankingQueryRepository, BankingStatementEntry } from "./read.js";

interface StoredOpenItem {
  id: string;
  invoiceNumber: string;
  openCents: number;
}

interface StoredPayment {
  id: string;
  externalRef: string;
  source: PersistablePayment["source"];
  amountCents: number;
  reference: string;
  matched: boolean;
  bookedAt: Date;
}

export class InMemoryBankingRepository implements BankingRepository, BankingQueryRepository {
  private readonly payments: StoredPayment[] = [];
  private seq = 0;

  /** openItems = offene Posten (Stammdaten); Restbeträge werden fortgeschrieben. */
  constructor(private readonly openItems: StoredOpenItem[]) {}

  async existingExternalRefs(refs: string[]): Promise<Set<string>> {
    const known = new Set(this.payments.map((p) => p.externalRef));
    return new Set(refs.filter((r) => known.has(r)));
  }

  async listOpenItems(): Promise<OpenItemRef[]> {
    return this.openItems
      .filter((oi) => oi.openCents > 0)
      .map((oi) => ({ id: oi.id, invoiceNumber: oi.invoiceNumber, openCents: oi.openCents }));
  }

  async persist(payments: PersistablePayment[]): Promise<void> {
    for (const p of payments) {
      this.payments.push({
        id: `pay_${++this.seq}`,
        externalRef: p.externalRef,
        source: p.source,
        amountCents: p.amountCents,
        reference: p.reference,
        matched: p.matched,
        bookedAt: new Date(),
      });
      for (const a of p.allocations) {
        const oi = this.openItems.find((x) => x.id === a.openItemId);
        if (oi) oi.openCents -= a.allocatedCents + (a.skontoCents ?? 0);
      }
    }
  }

  async listClarifications(limit: number): Promise<BankingClarificationItem[]> {
    return this.payments
      .filter((p) => !p.matched)
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        externalRef: p.externalRef,
        amountCents: p.amountCents,
        reference: p.reference,
        bookedAt: p.bookedAt,
      }));
  }

  async listStatementEntries(limit: number): Promise<BankingStatementEntry[]> {
    return [...this.payments]
      .sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime())
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        externalRef: p.externalRef,
        amountCents: p.amountCents,
        reference: p.reference,
        matched: p.matched,
        source: p.source,
        bookedAt: p.bookedAt,
      }));
  }

  /** Test-Helfer: aktueller Restbetrag eines OP. */
  openCentsOf(openItemId: string): number | undefined {
    return this.openItems.find((x) => x.id === openItemId)?.openCents;
  }
}
