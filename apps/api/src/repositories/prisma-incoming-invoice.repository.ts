// Prisma-Implementierung der Eingangsrechnungs-Repositories (Produktionspfad, C4).
// Lieferantenauflösung über USt-IdNr. (bevorzugt) bzw. exakten Namen; Idempotenz über
// das Unique (supplierId, number). Status startet bei ERFASST (3-Way-Match: Folgeschritt).

import { prisma } from "@texma/db";
import type {
  CreateIncomingInvoiceInput,
  IncomingInvoiceRepository,
} from "../modules/incoming-invoice/incoming-invoice.service.js";
import type { IncomingInvoiceListItem, IncomingInvoiceQueryRepository } from "./read.js";

export class PrismaIncomingInvoiceRepository
  implements IncomingInvoiceRepository, IncomingInvoiceQueryRepository
{
  async findSupplierByVatIdOrName(vatId: string | undefined, name: string): Promise<string | null> {
    if (vatId) {
      const byVat = await prisma.supplier.findFirst({ where: { vatId }, select: { id: true } });
      if (byVat) return byVat.id;
    }
    const byName = await prisma.supplier.findFirst({ where: { name }, select: { id: true } });
    return byName?.id ?? null;
  }

  async findBySupplierAndNumber(supplierId: string, number: string): Promise<{ id: string } | null> {
    const inv = await prisma.incomingInvoice.findUnique({
      where: { supplierId_number: { supplierId, number } },
      select: { id: true },
    });
    return inv ?? null;
  }

  async createIncomingInvoice(input: CreateIncomingInvoiceInput): Promise<{ id: string }> {
    const inv = await prisma.incomingInvoice.create({
      data: {
        supplierId: input.supplierId,
        number: input.number,
        netCents: input.netCents,
        taxCents: input.taxCents,
        grossCents: input.grossCents,
        receivedAt: input.issueDate,
        purchaseOrderId: input.purchaseOrderId ?? null,
        status: input.status ?? "ERFASST",
      },
      select: { id: true },
    });
    return inv;
  }

  /** Genau eine noch nicht vollständig erhaltene Bestellung des Lieferanten + deren Soll-Netto. */
  async findSoleOpenPoForSupplier(supplierId: string): Promise<{ id: string; expectedNetCents: number } | null> {
    const pos = await prisma.purchaseOrder.findMany({
      where: { supplierId, status: { not: "ERHALTEN" } },
      select: { id: true, lines: { select: { qty: true, ekCents: true } } },
      take: 2,
    });
    if (pos.length !== 1) return null;
    const po = pos[0]!;
    return { id: po.id, expectedNetCents: po.lines.reduce((s, l) => s + l.qty * l.ekCents, 0) };
  }

  async listRecent(limit: number): Promise<IncomingInvoiceListItem[]> {
    return prisma.incomingInvoice.findMany({
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        id: true,
        supplierId: true,
        number: true,
        netCents: true,
        taxCents: true,
        grossCents: true,
        status: true,
        receivedAt: true,
      },
    });
  }
}
