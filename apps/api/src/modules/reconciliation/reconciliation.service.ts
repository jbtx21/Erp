// Vereinheitlichter Zahlungsabgleich (IA-Objekt-Merge, Kap. 9.4): EIN Lese-/Datenmodell
// über alle Zahlungsquellen (CAMT-Import, Provider-Sync, manuelle Erfassung) — statt drei
// getrennter Backends hinter den Tabs. Liefert je Zahlungseingang Herkunft + Allokationen
// + Abgleich-Status und je offenem Posten das Aging-Band. Reine Aggregation über die
// gemeinsamen Tabellen Payment/PaymentAllocation/OpenItem (kein neuer Schreibpfad).

import {
  reconcileStatus, agingBucket, overdueDays,
  type PaymentSource, type ReconcileStatus, type AgingBucket,
} from "@texma/shared";

export interface ReconAllocation {
  openItemId: string;
  invoiceNumber: string;
  companyName: string;
  amountCents: number;
}

/** Roh-Zahlungseingang aus dem Repository (vor Status-Ableitung). */
export interface ReconPaymentRow {
  id: string;
  source: PaymentSource;
  externalRef: string | null;
  reference: string | null;
  amountCents: number;
  bookedAt: Date;
  allocations: ReconAllocation[];
}

/** Ein Zahlungseingang im vereinheitlichten Abgleich (Herkunft + Status). */
export interface PaymentMatch extends ReconPaymentRow {
  allocatedCents: number;
  status: ReconcileStatus;
}

export interface ReconOpenItemRow {
  id: string;
  invoiceNumber: string;
  companyName: string;
  openCents: number;
  grossCents: number;
  dueDate: Date;
  dunningLevel: number;
}

/** Offener Posten mit abgeleitetem Aging (für den OP-Tab desselben Modells). */
export interface OpenItemAging extends ReconOpenItemRow {
  overdueDays: number;
  bucket: AgingBucket;
}

export interface ReconciliationSummary {
  paymentsTotal: number;
  bySource: Record<PaymentSource, number>;
  byStatus: Record<ReconcileStatus, number>;
  openItemsCount: number;
  openTotalCents: number;
  overdueTotalCents: number;
}

export interface ReconciliationOverview {
  matches: PaymentMatch[];
  openItems: OpenItemAging[];
  summary: ReconciliationSummary;
}

export interface ReconciliationRepository {
  listPayments(limit: number): Promise<ReconPaymentRow[]>;
  listOpenItems(): Promise<ReconOpenItemRow[]>;
}

export class ReconciliationService {
  constructor(private readonly repo: ReconciliationRepository, private readonly now: () => Date = () => new Date()) {}

  /** Vereinheitlichte Abgleich-Sicht: Zahlungen (mit Status) + OP-Aging + Kennzahlen. */
  async overview(limit = 100): Promise<ReconciliationOverview> {
    const asOf = this.now();
    const [payments, openItems] = await Promise.all([this.repo.listPayments(limit), this.repo.listOpenItems()]);

    const matches: PaymentMatch[] = payments.map((p) => {
      const allocatedCents = p.allocations.reduce((s, a) => s + a.amountCents, 0);
      return { ...p, allocatedCents, status: reconcileStatus(p.amountCents, allocatedCents) };
    });

    const aged: OpenItemAging[] = openItems.map((oi) => ({
      ...oi, overdueDays: overdueDays(oi.dueDate, asOf), bucket: agingBucket(oi.dueDate, asOf),
    }));

    const bySource: Record<PaymentSource, number> = { CAMT: 0, PROVIDER: 0, MANUAL: 0 };
    const byStatus: Record<ReconcileStatus, number> = { ZUGEORDNET: 0, TEILZUGEORDNET: 0, KLAERUNG: 0 };
    for (const m of matches) { bySource[m.source]++; byStatus[m.status]++; }

    const openTotalCents = aged.reduce((s, oi) => s + oi.openCents, 0);
    const overdueTotalCents = aged.filter((oi) => oi.bucket !== "NICHT_FAELLIG").reduce((s, oi) => s + oi.openCents, 0);

    return {
      matches, openItems: aged,
      summary: {
        paymentsTotal: matches.length, bySource, byStatus,
        openItemsCount: aged.length, openTotalCents, overdueTotalCents,
      },
    };
  }
}
