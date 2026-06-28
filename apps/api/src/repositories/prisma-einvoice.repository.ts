// Prisma-Repository der Ausgangs-E-Rechnung (Kap. 19): lädt Käufer + Positionen aus der
// Rechnung (Positionen über den verknüpften Auftrag) und speichert die erzeugte XML am Beleg.

import { prisma } from "@texma/db";
import type { EInvoiceData, EInvoiceRepository } from "../modules/einvoice/einvoice.service.js";

export class PrismaEInvoiceRepository implements EInvoiceRepository {
  async invoiceForEInvoice(invoiceId: string): Promise<EInvoiceData | null> {
    const i = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        number: true, issuedAt: true, netCents: true, taxCents: true, grossCents: true,
        company: { select: { name: true, vatId: true, country: true, waehrung: true } },
        order: { select: { lines: { orderBy: { position: "asc" }, select: { description: true, qty: true, unitNetCents: true, listNetCents: true, rabattPct: true } } } },
      },
    });
    if (!i) return null;
    return {
      number: i.number,
      issuedAt: i.issuedAt,
      netCents: i.netCents,
      taxCents: i.taxCents,
      grossCents: i.grossCents,
      currency: i.company.waehrung || "EUR",
      buyer: { name: i.company.name, ...(i.company.vatId ? { vatId: i.company.vatId } : {}), country: i.company.country || "DE" },
      lines: (i.order?.lines ?? []).map((l) => ({ description: l.description, qty: l.qty, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents, rabattPct: l.rabattPct })),
    };
  }

  async persistXml(invoiceId: string, xml: string): Promise<void> {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { eInvoiceXml: xml } });
  }
}
