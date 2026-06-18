// Anwendungsfall: Bank-Kontoauszug (CAMT.053) importieren und gegen offene Posten
// abgleichen (Kap. 9.4 / T-13). Bindet die reinen Funktionen `parseCamt053` +
// `matchPayments` (@texma/shared) an Persistenz und GoBD-Audit. Zahlungseingänge mit
// erkannter Rechnungsnummer werden dem OP zugeordnet (Teil-/Vollzahlung), nicht
// zuordenbare/mehrdeutige/überzahlte landen als unmatched auf der Klärungsliste.
// Idempotent über die Bank-Transaktionsreferenz (Payment.externalRef).

import {
  creditTransactions,
  matchPayments,
  parseCamt053,
  type IncomingPayment,
  type OpenItemRef,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface PersistableAllocation {
  openItemId: string;
  allocatedCents: number;
}

export interface PersistablePayment {
  externalRef: string;
  reference: string;
  amountCents: number;
  /** Vollständig einem OP zugeordnet (keine Klärung). */
  matched: boolean;
  allocations: PersistableAllocation[];
}

export interface BankingRepository {
  /** Bereits importierte Bank-Referenzen (Idempotenz). */
  existingExternalRefs(refs: string[]): Promise<Set<string>>;
  /** Offene Posten mit Rechnungsnummer + Restbetrag (> 0). */
  listOpenItems(): Promise<OpenItemRef[]>;
  /** Persistiert Zahlungen + Allokationen und schreibt die OP-Restbeträge fort. */
  persist(payments: PersistablePayment[]): Promise<void>;
}

export interface BankingImportResult {
  imported: number; // neu persistierte Zahlungseingänge
  matched: number; // davon einem OP zugeordnet (bezahlt/teilbezahlt)
  clarified: number; // davon (auch) auf der Klärungsliste
  skipped: number; // bereits importiert (Idempotenz)
}

export class BankingImportService {
  constructor(
    private readonly repo: BankingRepository,
    private readonly audit: AuditSink
  ) {}

  async importStatement(xml: string): Promise<BankingImportResult> {
    const credits = creditTransactions(parseCamt053(xml));
    const existing = await this.repo.existingExternalRefs(credits.map((c) => c.externalRef));
    const fresh = credits.filter((c) => !existing.has(c.externalRef));

    if (fresh.length === 0) {
      return { imported: 0, matched: 0, clarified: 0, skipped: credits.length };
    }

    const openItems = await this.repo.listOpenItems();
    const incoming: IncomingPayment[] = fresh.map((c) => ({
      id: c.externalRef,
      reference: c.reference,
      amountCents: c.amountCents,
    }));
    const result = matchPayments(incoming, openItems);

    const allocByPayment = new Map<string, PersistableAllocation[]>();
    for (const a of result.allocations) {
      const list = allocByPayment.get(a.paymentId) ?? [];
      list.push({ openItemId: a.openItemId, allocatedCents: a.allocatedCents });
      allocByPayment.set(a.paymentId, list);
    }
    const clarifiedIds = new Set(result.clarifications.map((c) => c.paymentId));

    const persistables: PersistablePayment[] = fresh.map((c) => {
      const allocations = allocByPayment.get(c.externalRef) ?? [];
      const matched = allocations.length > 0 && !clarifiedIds.has(c.externalRef);
      return { externalRef: c.externalRef, reference: c.reference, amountCents: c.amountCents, matched, allocations };
    });

    await this.repo.persist(persistables);

    const matched = persistables.filter((p) => p.matched).length;
    const clarified = persistables.filter((p) => clarifiedIds.has(p.externalRef)).length;

    await this.audit.append(
      buildEntry({
        entity: "Payment",
        entityId: "camt.import",
        action: "CREATE",
        after: { source: "camt053", imported: fresh.length, matched, clarified },
      })
    );

    return { imported: fresh.length, matched, clarified, skipped: credits.length - fresh.length };
  }
}
