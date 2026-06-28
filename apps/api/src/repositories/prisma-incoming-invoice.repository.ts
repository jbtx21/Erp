// Prisma-Implementierung der Eingangsrechnungs-Repositories (Produktionspfad, Kap. 9.4/9.6/19).
// Lieferantenauflösung über USt-IdNr. (bevorzugt) bzw. exakten Namen; Idempotenz über das Unique
// (supplierId, number). Persistiert Positionen (EK-Abgleich) + Konditions-Snapshot; löst den
// Stamm-EK je Variante aus SupplierItem.ekCents auf.

import { prisma } from "@texma/db";
import type {
  CreateIncomingInvoiceInput,
  EkCheckStatus,
  IncomingInvoiceDetail,
  IncomingInvoiceRepository,
  SupplierTerms,
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
        issueDate: input.issueDate,
        purchaseOrderId: input.purchaseOrderId ?? null,
        status: input.status ?? "ERFASST",
        source: input.source,
        eInvoiceXml: input.eInvoiceXml ?? null,
        dueDate: input.dueDate,
        skontoPercent: input.skontoPercent,
        skontoDays: input.skontoDays,
        skontoUntil: input.skontoUntil,
        lines: { create: input.lines.map((l) => ({ position: l.position, description: l.description, supplierSku: l.supplierSku, variantId: l.variantId, qty: l.qty, unitEkCents: l.unitEkCents, lineNetCents: l.lineNetCents })) },
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

  async supplierTerms(supplierId: string): Promise<SupplierTerms | null> {
    const s = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { zahlungszielTage: true, skontoPercent: true, skontoDays: true } });
    return s ? { zahlungszielTage: s.zahlungszielTage, skontoPercent: s.skontoPercent, skontoDays: s.skontoDays } : null;
  }

  async resolveVariantBySupplierSku(supplierId: string, skus: string[]): Promise<Map<string, string>> {
    const items = await prisma.supplierItem.findMany({
      where: { supplierId, supplierSku: { in: skus } },
      select: { supplierSku: true, variantId: true },
    });
    const map = new Map<string, string>();
    for (const it of items) if (it.supplierSku) map.set(it.supplierSku, it.variantId);
    return map;
  }

  async detail(invoiceId: string): Promise<IncomingInvoiceDetail | null> {
    const i = await prisma.incomingInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true, number: true, supplierId: true, status: true, ekCheckStatus: true, source: true,
        netCents: true, taxCents: true, grossCents: true, issueDate: true, dueDate: true,
        skontoPercent: true, skontoDays: true, skontoUntil: true, paidAt: true, paymentAmountCents: true, freigegebenVon: true,
        supplier: { select: { name: true } },
        lines: { orderBy: { position: "asc" }, select: { description: true, supplierSku: true, variantId: true, qty: true, unitEkCents: true } },
      },
    });
    if (!i) return null;

    // Stamm-EK je beteiligter Variante aus SupplierItem (Lieferanten-Einkaufspreis).
    const variantIds = [...new Set(i.lines.map((l) => l.variantId).filter((v): v is string => !!v))];
    const masterItems = variantIds.length > 0
      ? await prisma.supplierItem.findMany({ where: { supplierId: i.supplierId, variantId: { in: variantIds } }, select: { variantId: true, ekCents: true } })
      : [];
    const master = new Map(masterItems.map((m) => [m.variantId, m.ekCents]));

    return {
      id: i.id, number: i.number, supplierId: i.supplierId, supplierName: i.supplier.name,
      status: i.status as IncomingInvoiceDetail["status"], ekCheckStatus: i.ekCheckStatus as EkCheckStatus, source: i.source as IncomingInvoiceDetail["source"],
      netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents, issueDate: i.issueDate, dueDate: i.dueDate,
      skontoPercent: i.skontoPercent, skontoDays: i.skontoDays, skontoUntil: i.skontoUntil, paidAt: i.paidAt, paymentAmountCents: i.paymentAmountCents, freigegebenVon: i.freigegebenVon,
      lines: i.lines.map((l) => ({ ref: l.supplierSku ?? l.description, variantId: l.variantId, qty: l.qty, unitEkCents: l.unitEkCents, masterEkCents: l.variantId ? master.get(l.variantId) ?? null : null })),
    };
  }

  async setEkCheckStatus(invoiceId: string, status: EkCheckStatus): Promise<void> {
    await prisma.incomingInvoice.update({ where: { id: invoiceId }, data: { ekCheckStatus: status } });
  }

  async setFreigegeben(invoiceId: string, user: string): Promise<void> {
    await prisma.incomingInvoice.update({ where: { id: invoiceId }, data: { status: "FREIGEGEBEN", freigegebenVon: user, freigegebenAm: new Date() } });
  }

  async setPaid(invoiceId: string, amountCents: number, paidAt: Date): Promise<void> {
    await prisma.incomingInvoice.update({ where: { id: invoiceId }, data: { status: "BEZAHLT", paymentAmountCents: amountCents, paidAt } });
  }

  async listRecent(limit: number): Promise<IncomingInvoiceListItem[]> {
    const rows = await prisma.incomingInvoice.findMany({
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        id: true, supplierId: true, number: true, netCents: true, taxCents: true, grossCents: true,
        status: true, ekCheckStatus: true, dueDate: true, skontoUntil: true, receivedAt: true,
        supplier: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id, supplierId: r.supplierId, supplierName: r.supplier.name, number: r.number,
      netCents: r.netCents, taxCents: r.taxCents, grossCents: r.grossCents, status: r.status, ekCheckStatus: r.ekCheckStatus,
      dueDate: r.dueDate, skontoUntil: r.skontoUntil, receivedAt: r.receivedAt,
    }));
  }
}
