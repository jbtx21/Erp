// Prisma-Verknüpfungen: liest die Belegkette eines Auftrags über die bestehenden FKs.

import { prisma } from "@texma/db";
import type { LinkRef, LinksRepository, OrderLinks } from "../modules/links/links.service.js";

export class PrismaLinksRepository implements LinksRepository {
  async orderLinks(orderId: string): Promise<OrderLinks | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        number: true,
        quote: { select: { number: true, status: true } },
        production: { select: { number: true } },
        deliveryNotes: { select: { number: true } },
        invoice: { select: { number: true, finalized: true } },
        complaints: { select: { cause: true, followUp: true } },
        cashSales: { select: { belegNr: true } },
        nachproduktionen: { select: { number: true } },
      },
    });
    if (!o) return null;

    const links: LinkRef[] = [];
    if (o.quote) links.push({ type: "Angebot", label: `${o.quote.number} · ${o.quote.status}`, navKey: "quotes", financial: false });
    if (o.production) links.push({ type: "Produktionsauftrag", label: o.production.number, navKey: "prodreport", financial: false });
    for (const d of o.deliveryNotes) links.push({ type: "Lieferschein", label: d.number, navKey: "orders", financial: false });
    if (o.invoice) links.push({ type: "Rechnung", label: `${o.invoice.number}${o.invoice.finalized ? " · final" : " · Entwurf"}`, navKey: null, financial: true });
    for (const c of o.complaints) links.push({ type: "Reklamation", label: `${c.cause} → ${c.followUp}`, navKey: "reklamation", financial: false });
    for (const cs of o.cashSales) links.push({ type: "Barverkauf", label: cs.belegNr, navKey: null, financial: true });
    for (const n of o.nachproduktionen) links.push({ type: "Nachproduktion", label: n.number, navKey: "orders", financial: false });

    return { orderNumber: o.number, links };
  }
}
