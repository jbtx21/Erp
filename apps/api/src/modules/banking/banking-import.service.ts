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
  paypalCreditsFromCsv,
  type IncomingPayment,
  type OpenItemRef,
  type PaymentSource,
  type PaypalCredit,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface PersistableAllocation {
  openItemId: string;
  allocatedCents: number;
  /** Gewährter Skonto, der den OP zusätzlich schließt (0 = kein Skonto). */
  skontoCents?: number;
}

export interface PersistablePayment {
  externalRef: string;
  reference: string;
  amountCents: number;
  /** Provider-/PayPal-Gebühr (separater Aufwand, nicht im OP-Abgleich). */
  feeCents?: number;
  /** ISO-4217 (PayPal-Fremdwährung); Default EUR. */
  currency?: string;
  /** Herkunft (vereinheitlichter Abgleich): CAMT-Datei, Provider-Sync oder PayPal. */
  source: PaymentSource;
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

/** Normalisierte Gutschrift (Quelle: CAMT.053-Datei, Provider-Sync EBICS/PSD2 oder PayPal). */
export interface NormalizedCreditInput {
  externalRef: string;
  reference: string;
  amountCents: number;
  /** Auftraggebername — Grundlage der 2. Matching-Stufe (Betrag + Name). */
  payerName?: string;
  /** Provider-/PayPal-Gebühr (separater Aufwand). */
  feeCents?: number;
  /** ISO-4217 (PayPal-Fremdwährung). */
  currency?: string;
}

export class BankingImportService {
  constructor(
    private readonly repo: BankingRepository,
    private readonly audit: AuditSink
  ) {}

  /** Importiert einen CAMT.053-Kontoauszug (Datei-Upload, T-13). */
  async importStatement(xml: string): Promise<BankingImportResult> {
    const credits = creditTransactions(parseCamt053(xml));
    return this.importCredits(
      credits.map((c) => ({ externalRef: c.externalRef, reference: c.reference, amountCents: c.amountCents })),
      "camt053",
      "CAMT"
    );
  }

  /**
   * Importiert PayPal-Gutschriften (Aktivitäten-CSV-Export) und speist sie in dieselbe
   * Abgleich-Pipeline ein (PaymentSource PAYPAL). Brutto klärt den OP; die PayPal-Gebühr
   * wird als separater Aufwand am Payment mitgeführt (Kap. 9.4).
   */
  async importPaypalCsv(csv: string): Promise<BankingImportResult> {
    return this.importPaypal(paypalCreditsFromCsv(csv));
  }

  /** Importiert bereits normalisierte PayPal-Gutschriften (Brutto + Gebühr + Währung). */
  async importPaypal(credits: ReadonlyArray<PaypalCredit>): Promise<BankingImportResult> {
    return this.importCredits(
      credits.map((c) => ({
        externalRef: c.externalRef,
        reference: c.reference,
        amountCents: c.amountCents,
        feeCents: c.feeCents,
        currency: c.currency,
        ...(c.payerName ? { payerName: c.payerName } : {}),
      })),
      "paypal",
      "PAYPAL"
    );
  }

  /**
   * Importiert normalisierte Gutschriften (z. B. aus dem Bank-Provider-Sync EBICS/PSD2) und
   * gleicht sie gegen offene Posten ab. Idempotent über die Bank-Referenz (externalRef).
   */
  async importCredits(
    credits: ReadonlyArray<NormalizedCreditInput>,
    source = "sync",
    paymentSource: PaymentSource = "PROVIDER"
  ): Promise<BankingImportResult> {
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
      ...(c.payerName ? { payerName: c.payerName } : {}),
    }));
    const result = matchPayments(incoming, openItems);

    const allocByPayment = new Map<string, PersistableAllocation[]>();
    for (const a of result.allocations) {
      const list = allocByPayment.get(a.paymentId) ?? [];
      list.push({ openItemId: a.openItemId, allocatedCents: a.allocatedCents, ...(a.skontoCents ? { skontoCents: a.skontoCents } : {}) });
      allocByPayment.set(a.paymentId, list);
    }
    const clarifiedIds = new Set(result.clarifications.map((c) => c.paymentId));

    const persistables: PersistablePayment[] = fresh.map((c) => {
      const allocations = allocByPayment.get(c.externalRef) ?? [];
      const matched = allocations.length > 0 && !clarifiedIds.has(c.externalRef);
      return {
        externalRef: c.externalRef,
        reference: c.reference,
        amountCents: c.amountCents,
        ...(c.feeCents ? { feeCents: c.feeCents } : {}),
        ...(c.currency ? { currency: c.currency } : {}),
        source: paymentSource,
        matched,
        allocations,
      };
    });

    await this.repo.persist(persistables);

    const matched = persistables.filter((p) => p.matched).length;
    const clarified = persistables.filter((p) => clarifiedIds.has(p.externalRef)).length;

    await this.audit.append(
      buildEntry({
        entity: "Payment",
        entityId: "bank.import",
        action: "CREATE",
        after: { source, imported: fresh.length, matched, clarified },
      })
    );

    return { imported: fresh.length, matched, clarified, skipped: credits.length - fresh.length };
  }
}
