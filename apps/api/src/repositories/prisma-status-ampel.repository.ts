// Prisma-Implementierung der Auftragsampel-Fakten (Produktionspfad). Lädt die aktiven
// Aufträge samt Kunde, Positionen, Rechnung/OP und Produktion; der Hauptlagerbestand je
// Variante kommt aus dem StockLevel-Cache (eine zusätzliche Abfrage, dann gemappt).

import { prisma } from "@texma/db";
import type { AuftragsampelInput } from "@texma/shared";
import type { AuftragFacts, AuftragProzessExtra, StatusAmpelRepository } from "../modules/status-ampel/status-ampel.service.js";

export class PrismaStatusAmpelRepository implements StatusAmpelRepository {
  async auftragFacts(): Promise<AuftragFacts[]> {
    const orders = await prisma.order.findMany({
      where: { status: { notIn: ["ABGESCHLOSSEN", "STORNIERT"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, number: true, status: true, zugesagterLiefertermin: true,
        lieferstatus: true, fakturastatus: true, freigegeben: true,
        company: { select: { name: true, country: true, vatId: true, mahnsperre: true } },
        lines: { select: { variantId: true, qty: true, kind: true } },
        invoice: { select: { grossCents: true, openItem: { select: { openCents: true } } } },
        production: { select: { id: true } },
      },
    });

    // Hauptlagerbestand je beteiligter Variante (StockLevel-Cache).
    const variantIds = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.variantId).filter((v): v is string => v !== null)))];
    const levels = variantIds.length > 0
      ? await prisma.stockLevel.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, qty: true } })
      : [];
    const stock = new Map(levels.map((l) => [l.variantId, l.qty]));

    return orders.map((o) => ({
      id: o.id,
      number: o.number,
      companyName: o.company.name,
      country: o.company.country,
      vatId: o.company.vatId,
      liefersperre: o.company.mahnsperre,
      status: o.status as AuftragsampelInput["status"],
      liefertermin: o.zugesagterLiefertermin,
      lieferstatus: o.lieferstatus as AuftragsampelInput["lieferstatus"],
      fakturastatus: o.fakturastatus as AuftragsampelInput["fakturastatus"],
      openCents: o.invoice?.openItem?.openCents ?? null,
      grossCents: o.invoice?.grossCents ?? null,
      freigegeben: o.freigegeben,
      hasProduction: o.production !== null,
      lines: o.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, stockQty: l.variantId ? stock.get(l.variantId) ?? 0 : 0, kind: l.kind })),
    }));
  }

  async orderDetailFacts(orderId: string): Promise<(AuftragFacts & AuftragProzessExtra) | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, number: true, status: true, route: true, zugesagterLiefertermin: true,
        lieferstatus: true, fakturastatus: true, freigegeben: true,
        company: { select: { name: true, country: true, vatId: true, mahnsperre: true } },
        lines: { select: { variantId: true, qty: true, kind: true } },
        invoice: { select: { grossCents: true, openItem: { select: { openCents: true } } } },
        production: {
          select: {
            id: true,
            purchaseOrders: { select: { goodsReceipts: { select: { id: true } } } },
            subOrders: { select: { beistellungVersandtAm: true, ruecklaufErhaltenAm: true } },
          },
        },
      },
    });
    if (!o) return null;

    const variantIds = [...new Set(o.lines.map((l) => l.variantId).filter((v): v is string => v !== null))];
    const levels = variantIds.length > 0
      ? await prisma.stockLevel.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, qty: true } })
      : [];
    const stock = new Map(levels.map((l) => [l.variantId, l.qty]));
    const subs = o.production?.subOrders ?? [];

    return {
      id: o.id,
      number: o.number,
      companyName: o.company.name,
      country: o.company.country,
      vatId: o.company.vatId,
      liefersperre: o.company.mahnsperre,
      status: o.status as AuftragsampelInput["status"],
      liefertermin: o.zugesagterLiefertermin,
      lieferstatus: o.lieferstatus as AuftragsampelInput["lieferstatus"],
      fakturastatus: o.fakturastatus as AuftragsampelInput["fakturastatus"],
      openCents: o.invoice?.openItem?.openCents ?? null,
      grossCents: o.invoice?.grossCents ?? null,
      freigegeben: o.freigegeben,
      hasProduction: o.production !== null,
      lines: o.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, stockQty: l.variantId ? stock.get(l.variantId) ?? 0 : 0, kind: l.kind })),
      // Prozess-Zusatzfakten:
      route: o.route as AuftragProzessExtra["route"],
      terminSet: o.zugesagterLiefertermin !== null,
      hasPurchaseOrder: (o.production?.purchaseOrders.length ?? 0) > 0,
      hasGoodsReceipt: (o.production?.purchaseOrders ?? []).some((po) => po.goodsReceipts.length > 0),
      subCount: subs.length,
      subBeigestellt: subs.filter((s) => s.beistellungVersandtAm !== null).length,
      subZurueck: subs.filter((s) => s.ruecklaufErhaltenAm !== null).length,
    };
  }
}
