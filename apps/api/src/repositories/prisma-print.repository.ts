// Prisma-Druckdaten: liest Lieferschein/Rechnung samt Positionen + Empfängeradresse.

import { prisma } from "@texma/db";
import { lineNet, taxOnNet, VAT_STANDARD, type PositionKind } from "@texma/shared";
import type { DeliveryNotePrintData, InvoicePrintData, LaufzettelPrintData, OrderConfirmationPrintData, PrintRepository, PricePrintLine, QuotePrintData } from "../modules/print/print.service.js";

/** Netto/USt/Brutto aus Preis-Positionen (Standard-USt) — für Angebot/AB ohne gespeicherte Steuer. */
function totals(lines: PricePrintLine[]): { netCents: number; taxCents: number; grossCents: number } {
  const netCents = lines.reduce((sum, l) => sum + lineNet(l.menge, l.einzelpreisCents), 0);
  const taxCents = taxOnNet(netCents, VAT_STANDARD);
  return { netCents, taxCents, grossCents: netCents + taxCents };
}

const ROUTE_LABEL: Record<string, string> = {
  ROUTE1_KEINE: "Route 1 – keine Veredelung", ROUTE2_INTERN: "Route 2 – interne Veredelung",
  ROUTE3_EXTERN: "Route 3 – externe Veredler", ROUTE4_EXTERN_INTERN: "Route 4 – extern + intern",
};

function addressLines(companyName: string, addr: { street: string; zip: string; city: string } | null): string[] {
  return addr ? [companyName, addr.street, `${addr.zip} ${addr.city}`] : [companyName];
}

/** Empfängerblock aus der Kunden-Rechnungsadresse (Pflicht auf Rechnung, § 14 UStG);
 *  fällt auf eine ggf. übergebene Lieferadresse bzw. den Namen zurück. USt-IdNr. ergänzt. */
function recipientLines(
  company: { name: string; street: string | null; zip: string | null; city: string | null; country: string | null; vatId: string | null },
  fallbackAddr: { street: string; zip: string; city: string } | null
): string[] {
  const lines = [company.name];
  if (company.street && company.zip && company.city) {
    lines.push(company.street, `${company.zip} ${company.city}`);
    if (company.country && company.country !== "DE") lines.push(company.country);
  } else if (fallbackAddr) {
    lines.push(fallbackAddr.street, `${fallbackAddr.zip} ${fallbackAddr.city}`);
  }
  if (company.vatId) lines.push(`USt-IdNr.: ${company.vatId}`);
  return lines;
}

export class PrismaPrintRepository implements PrintRepository {
  async briefkopf(): Promise<string[]> {
    const row = await prisma.appSetting.findUnique({ where: { key: "briefkopf" } });
    return row ? row.value.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  }
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

  async laufzettelForPrint(orderId: string): Promise<LaufzettelPrintData | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        number: true, createdAt: true, route: true,
        company: { select: { name: true } },
        lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, kind: true } },
      },
    });
    if (!o) return null;
    return {
      number: o.number, createdAt: o.createdAt, kunde: o.company.name,
      routeLabel: o.route ? ROUTE_LABEL[o.route] ?? o.route : null,
      positionen: o.lines.map((l) => ({ menge: l.qty, bezeichnung: l.description, kind: l.kind as PositionKind })),
    };
  }

  async invoiceForPrint(id: string): Promise<InvoicePrintData | null> {
    const i = await prisma.invoice.findUnique({
      where: { id },
      select: {
        number: true, issuedAt: true, netCents: true, taxCents: true, grossCents: true,
        company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true } },
        order: { select: { deliveryAddress: { select: { street: true, zip: true, city: true } }, lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, unitNetCents: true, listNetCents: true, rabattPct: true } } } },
      },
    });
    if (!i) return null;
    return {
      number: i.number, issuedAt: i.issuedAt,
      empfaenger: recipientLines(i.company, i.order?.deliveryAddress ?? null),
      positionen: (i.order?.lines ?? []).map((l) => ({ menge: l.qty, bezeichnung: l.description, einzelpreisCents: l.unitNetCents, listenpreisCents: l.listNetCents, rabattPct: l.rabattPct })),
      netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents,
    };
  }

  async quoteForPrint(id: string): Promise<QuotePrintData | null> {
    const q = await prisma.quote.findUnique({
      where: { id },
      select: {
        number: true, createdAt: true, gueltigBisAm: true,
        company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true } },
        lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, unitNetCents: true, listNetCents: true, rabattPct: true } },
      },
    });
    if (!q) return null;
    const positionen: PricePrintLine[] = q.lines.map((l) => ({ menge: l.qty, bezeichnung: l.description, einzelpreisCents: l.unitNetCents, listenpreisCents: l.listNetCents, rabattPct: l.rabattPct }));
    return { number: q.number, datum: q.createdAt, empfaenger: recipientLines(q.company, null), positionen, ...totals(positionen), gueltigBis: q.gueltigBisAm };
  }

  async orderConfirmationForPrint(orderId: string): Promise<OrderConfirmationPrintData | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        number: true, createdAt: true, zugesagterLiefertermin: true, externalNumber: true,
        company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true } },
        deliveryAddress: { select: { street: true, zip: true, city: true } },
        lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, unitNetCents: true, listNetCents: true, rabattPct: true } },
      },
    });
    if (!o) return null;
    const positionen: PricePrintLine[] = o.lines.map((l) => ({ menge: l.qty, bezeichnung: l.description, einzelpreisCents: l.unitNetCents, listenpreisCents: l.listNetCents, rabattPct: l.rabattPct }));
    return {
      number: o.number, datum: o.createdAt, empfaenger: recipientLines(o.company, o.deliveryAddress),
      positionen, ...totals(positionen), liefertermin: o.zugesagterLiefertermin, bestellreferenz: o.externalNumber,
    };
  }
}
