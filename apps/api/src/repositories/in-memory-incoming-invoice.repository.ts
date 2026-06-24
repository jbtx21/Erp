// In-Memory-Implementierung der Eingangsrechnungs-Repositories — für Tests/lokale
// Durchstiche ohne DB. Lieferantenauflösung über eine vorab gesetzte Stammdatenmenge;
// Idempotenz über (supplierId, number) wie das Prisma-Unique.

import type {
  CreateIncomingInvoiceInput,
  IncomingInvoiceRepository,
} from "../modules/incoming-invoice/incoming-invoice.service.js";
import type { IncomingInvoiceListItem, IncomingInvoiceQueryRepository } from "./read.js";

export interface SeedSupplier {
  id: string;
  name: string;
  vatId?: string;
}

interface StoredInvoice extends Omit<CreateIncomingInvoiceInput, "status"> {
  id: string;
  status: string;
  receivedAt: Date;
}

export class InMemoryIncomingInvoiceRepository
  implements IncomingInvoiceRepository, IncomingInvoiceQueryRepository
{
  private readonly invoices: StoredInvoice[] = [];
  private seq = 0;

  /** suppliers = vorhandene Lieferanten (Stammdaten). Wächst durch Empfang NICHT. */
  constructor(private readonly suppliers: SeedSupplier[]) {}

  async findSupplierByVatIdOrName(vatId: string | undefined, name: string): Promise<string | null> {
    if (vatId) {
      const byVat = this.suppliers.find((s) => s.vatId && s.vatId === vatId);
      if (byVat) return byVat.id;
    }
    const byName = this.suppliers.find((s) => s.name === name);
    return byName?.id ?? null;
  }

  async findBySupplierAndNumber(supplierId: string, number: string): Promise<{ id: string } | null> {
    const inv = this.invoices.find((i) => i.supplierId === supplierId && i.number === number);
    return inv ? { id: inv.id } : null;
  }

  async createIncomingInvoice(input: CreateIncomingInvoiceInput): Promise<{ id: string }> {
    const id = `iinv_${++this.seq}`;
    this.invoices.push({ id, receivedAt: new Date(), ...input, status: input.status ?? "ERFASST" });
    return { id };
  }

  /** Ohne PO-Stammdaten im Speicher: kein Auto-Match (Tests setzen das gezielt via Override). */
  async findSoleOpenPoForSupplier(): Promise<{ id: string; expectedNetCents: number } | null> {
    return null;
  }

  async listRecent(limit: number): Promise<IncomingInvoiceListItem[]> {
    return this.invoices
      .slice(-limit)
      .reverse()
      .map((i) => ({
        id: i.id,
        supplierId: i.supplierId,
        number: i.number,
        netCents: i.netCents,
        taxCents: i.taxCents,
        grossCents: i.grossCents,
        status: i.status,
        receivedAt: i.receivedAt,
      }));
  }
}
