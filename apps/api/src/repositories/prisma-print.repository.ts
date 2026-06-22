// Prisma-Druckdaten: liest Lieferschein/Rechnung samt Positionen + Empfängeradresse.

import { prisma } from "@texma/db";
import type { DeliveryNotePrintData, InvoicePrintData, PrintRepository } from "../modules/print/print.service.js";

function addressLines(companyName: string, addr: { street: string; zip: string; city: string } | null): string[] {
  return addr ? [companyName, addr.street, `${addr.zip} ${addr.city}`] : [companyName];
}

export class PrismaPrintRepository implements PrintRepository {
  async deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null> {
    const d = await prisma.deliveryNote.findUnique({
      where: { id },
      select: {
        number: true, createdAt: true,
        lines: { select: { qty: true, orderLine: { select: { description: true } } } },
        order: { select: { company: { select: { name: true } }, deliveryAddress: { select: { street: true, zip: true, city: true } } } },
      },
    });
    if (!d) return null;
    return {
      number: d.number, createdAt: d.createdAt,
      empfaenger: addressLines(d.order.company.name, d.order.deliveryAddress),
      positionen: d.lines.map((l) => ({ menge: l.qty, bezeichnung: l.orderLine.description })),
    };
  }

  async invoiceForPrint(id: string): Promise<InvoicePrintData | null> {
    const i = await prisma.invoice.findUnique({
      where: { id },
      select: {
        number: true, issuedAt: true, netCents: true, taxCents: true, grossCents: true,
        company: { select: { name: true } },
        order: { select: { deliveryAddress: { select: { street: true, zip: true, city: true } }, lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, unitNetCents: true } } } },
      },
    });
    if (!i) return null;
    return {
      number: i.number, issuedAt: i.issuedAt,
      empfaenger: addressLines(i.company.name, i.order?.deliveryAddress ?? null),
      positionen: (i.order?.lines ?? []).map((l) => ({ menge: l.qty, bezeichnung: l.description, einzelpreisCents: l.unitNetCents })),
      netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents,
    };
  }
}
