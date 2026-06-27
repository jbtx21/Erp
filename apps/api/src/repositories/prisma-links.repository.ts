// Prisma-Verknüpfungen: liest die Belegkette eines Auftrags über die bestehenden FKs.

import { prisma } from "@texma/db";
import { formatEur } from "@texma/shared";
import type { LinkRef, LinksRepository, OrderLinks } from "../modules/links/links.service.js";

export class PrismaLinksRepository implements LinksRepository {
  async orderLinks(orderId: string): Promise<OrderLinks | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, number: true, status: true,
        quote: { select: { id: true, number: true, status: true, sampleLoans: { select: { id: true, status: true, zweck: true } } } },
        production: { select: { number: true,
          subOrders: { orderBy: { sequence: "asc" }, select: { id: true, number: true, status: true, inhouse: true, supplier: { select: { name: true } } } },
          purchaseOrders: { orderBy: { createdAt: "asc" }, select: { id: true, number: true, status: true, supplier: { select: { name: true } }, goodsReceipts: { orderBy: { receivedAt: "asc" }, select: { id: true, receivedAt: true } } } } } },
        abschlaege: { orderBy: { issuedAt: "asc" }, select: { id: true, number: true, netCents: true, bezahlt: true } },
        deliveryNotes: { select: { id: true, number: true } },
        invoice: { select: { id: true, number: true, finalized: true, creditNotes: { select: { id: true, number: true } }, openItem: { select: { dunningNotices: { orderBy: { erzeugtAm: "desc" }, select: { id: true, stufe: true } } } } } },
        complaints: { select: { cause: true, followUp: true } },
        cashSales: { select: { belegNr: true } },
        nachproduktionen: { select: { number: true } },
      },
    });
    if (!o) return null;

    const links: LinkRef[] = [];
    if (o.quote) links.push({ type: "Angebot", label: `${o.quote.number} · ${o.quote.status}`, navKey: "quotes", financial: false, id: o.quote.id, pdfKind: "quote", sourceEntity: "Quote" });
    // Muster-Leihgut aus dem Angebot (B5) — Lieferschein druck-/mailbar.
    for (const sl of o.quote?.sampleLoans ?? []) {
      links.push({ type: "Muster-Leihgut", label: `MUSTER-${sl.id.slice(-6).toUpperCase()} · ${sl.status}`, navKey: "samples", financial: false, id: sl.id, pdfKind: "sampleLoan", sourceEntity: "SampleLoan" });
    }
    // Auftragsbestätigung — eigener Beleg (über die Order-ID adressiert), sobald der Auftrag in Bearbeitung ist.
    if (o.status !== "ANGELEGT") links.push({ type: "Auftragsbestätigung", label: o.number, navKey: "orders", financial: false, id: o.id, pdfKind: "auftragsbestaetigung", sourceEntity: "Auftragsbestaetigung" });
    if (o.production) links.push({ type: "Produktionsauftrag", label: o.production.number, navKey: "prodreport", financial: false });
    // Bestellungen (Beschaffung) + zugehörige Wareneingänge je PA — Einkauf, operativ verknüpft.
    for (const po of o.production?.purchaseOrders ?? []) {
      links.push({ type: "Bestellung", label: `${po.number} · ${po.supplier?.name ?? ""} · ${po.status}`.replace(/ · $/, ""), navKey: "wareneingang", financial: false });
      for (const gr of po.goodsReceipts) links.push({ type: "Wareneingang", label: `WE-${gr.id.slice(-6).toUpperCase()} · ${gr.receivedAt.toLocaleDateString("de-DE")} (${po.number})`, navKey: "wareneingang", financial: false });
    }
    // Abschlags-/Teilrechnungen (Xentral) — finanzrelevant.
    for (const ab of o.abschlaege) links.push({ type: "Abschlagsrechnung", label: `${ab.number} · ${formatEur(ab.netCents)}${ab.bezahlt ? " · bezahlt" : " · offen"}`, navKey: "orders", financial: true, id: ab.id });
    // Veredelungsaufträge (Fremdvergabe-/Inhouse-Stufen) — Werkstattblatt je Stufe, druckbar + verknüpft.
    for (const sub of o.production?.subOrders ?? []) {
      const veredler = sub.inhouse ? "Inhouse" : (sub.supplier?.name ?? "Veredler");
      links.push({ type: "Veredelungsauftrag", label: `${sub.number} · ${veredler} · ${sub.status}`, navKey: "subproduction", financial: false, id: sub.id, pdfKind: "veredelungsauftrag", sourceEntity: "SubProductionOrder" });
    }
    for (const d of o.deliveryNotes) links.push({ type: "Lieferschein", label: d.number, navKey: "orders", financial: false, id: d.id, pdfKind: "deliveryNote", sourceEntity: "DeliveryNote" });
    if (o.invoice) {
      links.push({ type: "Rechnung", label: `${o.invoice.number}${o.invoice.finalized ? " · final" : " · Entwurf"}`, navKey: null, financial: true, id: o.invoice.id, pdfKind: "invoice", sourceEntity: "Invoice" });
      for (const cn of o.invoice.creditNotes) links.push({ type: "Gutschrift", label: cn.number, navKey: null, financial: true, id: cn.id, pdfKind: "creditNote", sourceEntity: "CreditNote" });
      // Mahnbelege (append-only Historie) — druck-/mailbar je Stufe.
      for (const dn of o.invoice.openItem?.dunningNotices ?? []) {
        links.push({ type: "Mahnung", label: `Stufe ${dn.stufe} (MA-${dn.stufe}-${dn.id.slice(-6).toUpperCase()})`, navKey: "dunning", financial: true, id: dn.id, pdfKind: "mahnung", sourceEntity: "DunningNotice" });
      }
    }
    for (const c of o.complaints) links.push({ type: "Reklamation", label: `${c.cause} → ${c.followUp}`, navKey: "reklamation", financial: false });
    for (const cs of o.cashSales) links.push({ type: "Barverkauf", label: cs.belegNr, navKey: null, financial: true });
    for (const n of o.nachproduktionen) links.push({ type: "Nachproduktion", label: n.number, navKey: "orders", financial: false });

    return { orderNumber: o.number, links };
  }
}
