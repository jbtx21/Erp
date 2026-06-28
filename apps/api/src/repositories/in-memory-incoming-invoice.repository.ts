// In-Memory-Implementierung der Eingangsrechnungs-Repositories — für Tests/lokale
// Durchstiche ohne DB. Lieferantenauflösung über eine vorab gesetzte Stammdatenmenge;
// Idempotenz über (supplierId, number) wie das Prisma-Unique.

import type {
  CreateIncomingInvoiceInput,
  EkCheckStatus,
  IncomingInvoiceDetail,
  IncomingInvoiceRepository,
  SupplierTerms,
} from "../modules/incoming-invoice/incoming-invoice.service.js";
import type { IncomingInvoiceListItem, IncomingInvoiceQueryRepository } from "./read.js";

export interface SeedSupplier {
  id: string;
  name: string;
  vatId?: string;
  zahlungszielTage?: number;
  skontoPercent?: number | null;
  skontoDays?: number | null;
  /** supplierSku → variantId (SupplierItem-Auflösung). */
  skuToVariant?: Record<string, string>;
  /** variantId → Stamm-EK (SupplierItem.ekCents). */
  masterEk?: Record<string, number>;
}

interface StoredInvoice extends Omit<CreateIncomingInvoiceInput, "status"> {
  id: string;
  status: string;
  ekCheckStatus: EkCheckStatus;
  receivedAt: Date;
  freigegebenVon: string | null;
  paidAt: Date | null;
  paymentAmountCents: number | null;
}

export class InMemoryIncomingInvoiceRepository
  implements IncomingInvoiceRepository, IncomingInvoiceQueryRepository
{
  private readonly invoices: StoredInvoice[] = [];
  private seq = 0;

  /** suppliers = vorhandene Lieferanten (Stammdaten). Wächst durch Empfang NICHT. */
  constructor(private readonly suppliers: SeedSupplier[]) {}

  private supplier(id: string): SeedSupplier | undefined {
    return this.suppliers.find((s) => s.id === id);
  }

  async findSupplierByVatIdOrName(vatId: string | undefined, name: string): Promise<string | null> {
    if (vatId) {
      const byVat = this.suppliers.find((s) => s.vatId && s.vatId === vatId);
      if (byVat) return byVat.id;
    }
    return this.suppliers.find((s) => s.name === name)?.id ?? null;
  }

  async findBySupplierAndNumber(supplierId: string, number: string): Promise<{ id: string } | null> {
    const inv = this.invoices.find((i) => i.supplierId === supplierId && i.number === number);
    return inv ? { id: inv.id } : null;
  }

  async createIncomingInvoice(input: CreateIncomingInvoiceInput): Promise<{ id: string }> {
    const id = `iinv_${++this.seq}`;
    this.invoices.push({ id, receivedAt: new Date(), ekCheckStatus: "OFFEN", freigegebenVon: null, paidAt: null, paymentAmountCents: null, ...input, status: input.status ?? "ERFASST" });
    return { id };
  }

  /** Ohne PO-Stammdaten im Speicher: kein Auto-Match (Tests setzen das gezielt via Override). */
  async findSoleOpenPoForSupplier(): Promise<{ id: string; expectedNetCents: number } | null> {
    return null;
  }

  async supplierTerms(supplierId: string): Promise<SupplierTerms | null> {
    const s = this.supplier(supplierId);
    if (!s) return null;
    return { zahlungszielTage: s.zahlungszielTage ?? 14, skontoPercent: s.skontoPercent ?? null, skontoDays: s.skontoDays ?? null };
  }

  async resolveVariantBySupplierSku(supplierId: string, skus: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const lookup = this.supplier(supplierId)?.skuToVariant ?? {};
    for (const sku of skus) if (lookup[sku]) map.set(sku, lookup[sku]!);
    return map;
  }

  async detail(invoiceId: string): Promise<IncomingInvoiceDetail | null> {
    const i = this.invoices.find((x) => x.id === invoiceId);
    if (!i) return null;
    const s = this.supplier(i.supplierId);
    const masterEk = s?.masterEk ?? {};
    return {
      id: i.id, number: i.number, supplierId: i.supplierId, supplierName: s?.name ?? "—",
      status: i.status as IncomingInvoiceDetail["status"], ekCheckStatus: i.ekCheckStatus, source: i.source,
      netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents,
      issueDate: i.issueDate, dueDate: i.dueDate, skontoPercent: i.skontoPercent, skontoDays: i.skontoDays, skontoUntil: i.skontoUntil,
      paidAt: i.paidAt, paymentAmountCents: i.paymentAmountCents, freigegebenVon: i.freigegebenVon,
      lines: i.lines.map((l) => ({ ref: l.supplierSku ?? l.description, variantId: l.variantId, qty: l.qty, unitEkCents: l.unitEkCents, masterEkCents: l.variantId ? masterEk[l.variantId] ?? null : null })),
    };
  }

  async setEkCheckStatus(invoiceId: string, status: EkCheckStatus): Promise<void> {
    const i = this.invoices.find((x) => x.id === invoiceId);
    if (i) i.ekCheckStatus = status;
  }

  async setFreigegeben(invoiceId: string, user: string): Promise<void> {
    const i = this.invoices.find((x) => x.id === invoiceId);
    if (i) { i.status = "FREIGEGEBEN"; i.freigegebenVon = user; }
  }

  async setPaid(invoiceId: string, amountCents: number, paidAt: Date): Promise<void> {
    const i = this.invoices.find((x) => x.id === invoiceId);
    if (i) { i.status = "BEZAHLT"; i.paymentAmountCents = amountCents; i.paidAt = paidAt; }
  }

  async listRecent(limit: number): Promise<IncomingInvoiceListItem[]> {
    return this.invoices
      .slice(-limit)
      .reverse()
      .map((i) => ({
        id: i.id, supplierId: i.supplierId, supplierName: this.supplier(i.supplierId)?.name ?? "—", number: i.number,
        netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents, status: i.status, ekCheckStatus: i.ekCheckStatus,
        dueDate: i.dueDate, skontoUntil: i.skontoUntil, receivedAt: i.receivedAt,
      }));
  }
}
