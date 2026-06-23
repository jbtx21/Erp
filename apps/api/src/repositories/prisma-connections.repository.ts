// Prisma-Read-Repo für die Belegkette eines Auftrags. Ein Query mit Includes über die
// vorhandenen Relationen; daraus wird der phasen-gruppierte Graph gebaut.
import { prisma } from "@texma/db";
import type { ConnectionGroup, ConnectionNode, ConnectionsRepository, OrderConnections } from "../modules/connections/connections.service.js";

export class PrismaConnectionsRepository implements ConnectionsRepository {
  async orderConnections(orderId: string): Promise<OrderConnections | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        quote: { select: { id: true, number: true, status: true } },
        deliveryNotes: { select: { id: true, number: true } },
        complaints: { select: { id: true, cause: true, followUp: true } },
        production: { select: { id: true, ampel: true, subOrders: { select: { id: true, status: true, sequence: true } } } },
        invoice: {
          select: {
            id: true, number: true, finalized: true,
            creditNotes: { select: { id: true, number: true, amountCents: true } },
            openItem: { select: { id: true, openCents: true, payments: { select: { payment: { select: { id: true, externalRef: true, amountCents: true } } } } } },
          },
        },
      },
    });
    if (!o) return null;

    const groups: ConnectionGroup[] = [];

    // Vorgänger: Angebot (und damit indirekt Lead/Anfrage)
    if (o.quote) {
      groups.push({ phase: "Vertrieb", nodes: [{ entity: "Quote", id: o.quote.id, label: o.quote.number, status: o.quote.status, navKey: "quotes" }] });
    }

    // Fulfillment: Lieferscheine, Rechnung, Gutschriften
    const fulfillment: ConnectionNode[] = [];
    for (const dn of o.deliveryNotes) fulfillment.push({ entity: "DeliveryNote", id: dn.id, label: dn.number, navKey: "shipments" });
    if (o.invoice) {
      fulfillment.push({ entity: "Invoice", id: o.invoice.id, label: o.invoice.number, status: o.invoice.finalized ? "FINALISIERT" : "ENTWURF", navKey: "invoices" });
      for (const cn of o.invoice.creditNotes) fulfillment.push({ entity: "CreditNote", id: cn.id, label: cn.number, status: "GUTSCHRIFT", navKey: "invoices" });
    }
    if (fulfillment.length > 0) groups.push({ phase: "Fulfillment", nodes: fulfillment });

    // Zahlung: offener Posten + zugeordnete Zahlungen
    if (o.invoice?.openItem) {
      const pay: ConnectionNode[] = [
        { entity: "OpenItem", id: o.invoice.openItem.id, label: `Offen ${(o.invoice.openItem.openCents / 100).toFixed(2)} €`, status: o.invoice.openItem.openCents === 0 ? "BEZAHLT" : "OFFEN", navKey: "banking" },
      ];
      for (const a of o.invoice.openItem.payments) pay.push({ entity: "Payment", id: a.payment.id, label: a.payment.externalRef ?? a.payment.id, navKey: "banking" });
      groups.push({ phase: "Zahlung", nodes: pay });
    }

    // Produktion: Produktionsauftrag + Fremdvergaben
    if (o.production) {
      const prod: ConnectionNode[] = [{ entity: "ProductionOrder", id: o.production.id, label: "Produktion", status: o.production.ampel, navKey: "prodreport" }];
      for (const s of o.production.subOrders) prod.push({ entity: "SubProductionOrder", id: s.id, label: `Fremdvergabe Stufe ${s.sequence}`, status: s.status, navKey: "subproduction" });
      groups.push({ phase: "Produktion", nodes: prod });
    }

    // Reklamation
    if (o.complaints.length > 0) {
      groups.push({ phase: "Reklamation", nodes: o.complaints.map((c) => ({ entity: "Complaint", id: c.id, label: `Reklamation (${c.cause})`, status: c.followUp, navKey: "reklamation" })) });
    }

    return {
      anchor: { entity: "Order", id: o.id, label: o.number, status: o.status, navKey: "orders" },
      groups,
    };
  }
}
