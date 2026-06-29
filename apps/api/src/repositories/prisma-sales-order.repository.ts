// Prisma-Auftragserstellung: manueller Auftrag + Angebot→Auftrag.

import { prisma } from "@texma/db";
import type { PositionKind } from "@texma/shared";
import type { ConversionPlan, OrderEditData, SalesLine, SalesOrderRepository } from "../modules/sales/sales-order.service.js";

export class PrismaSalesOrderRepository implements SalesOrderRepository {
  async companyExists(companyId: string): Promise<boolean> {
    return (await prisma.company.count({ where: { id: companyId } })) > 0;
  }

  async orderForEdit(orderId: string): Promise<OrderEditData | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, number: true, companyId: true, status: true,
        invoice: { select: { id: true } },
        production: { select: { id: true } },
        _count: { select: { deliveryNotes: true } },
        lines: { orderBy: { position: "asc" }, select: { description: true, qty: true, kind: true, unitNetCents: true, listNetCents: true, rabattPct: true, taxRatePct: true, dbCents: true, variantId: true, bezugPosition: true, lineType: true, placement: true, altPreisText: true, imPdfAusblenden: true } },
      },
    });
    if (!o) return null;
    return {
      id: o.id, number: o.number, companyId: o.companyId, status: String(o.status),
      invoiced: o.invoice !== null, inProduction: o.production !== null, delivered: o._count.deliveryNotes > 0,
      lines: o.lines.map((l) => ({ description: l.description, qty: l.qty, kind: l.kind as PositionKind, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents, rabattPct: l.rabattPct, taxRatePct: l.taxRatePct, dbCents: l.dbCents, variantId: l.variantId, bezugPosition: l.bezugPosition, lineType: l.lineType as import("@texma/shared").LineType, placement: l.placement, altPreisText: l.altPreisText, imPdfAusblenden: l.imPdfAusblenden })),
    };
  }

  async updateOrder(orderId: string, companyId: string, lines: SalesLine[]): Promise<void> {
    // Bereits gelieferte Menge je Bestandsposition (positionsweise) ermitteln.
    const existing = await prisma.orderLine.findMany({
      where: { orderId },
      orderBy: { position: "asc" },
      select: { id: true, qty: true, deliveryLines: { select: { qty: true } } },
    });
    const deliveredByIdx = existing.map((l) => l.deliveryLines.reduce((s, d) => s + d.qty, 0));
    const lineData = (l: SalesLine, i: number) => ({
      position: i + 1, description: l.description, qty: l.qty, unitNetCents: l.unitNetCents,
      listNetCents: l.listNetCents ?? null, rabattPct: l.rabattPct ?? null, taxRatePct: l.taxRatePct ?? 19, dbCents: l.dbCents ?? null,
      kind: (l.kind ?? "TEXTIL") as never, variantId: l.variantId ?? null, bezugPosition: l.bezugPosition ?? null,
      lineType: l.lineType ?? "ARTIKEL", placement: l.placement ?? null, altPreisText: l.altPreisText ?? null, imPdfAusblenden: l.imPdfAusblenden ?? false,
    });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { companyId } });
      const n = Math.max(existing.length, lines.length);
      for (let i = 0; i < n; i++) {
        const ex = existing[i];
        const nw = lines[i];
        const delivered = ex ? deliveredByIdx[i]! : 0;
        if (ex && !nw) {
          // Entfallende Position — bereits gelieferte Positionen dürfen nicht wegfallen.
          if (delivered > 0) throw new Error(`Position ${i + 1} ist bereits geliefert und kann nicht entfernt werden.`);
          await tx.orderLine.delete({ where: { id: ex.id } });
        } else if (ex && nw) {
          if (delivered > nw.qty) throw new Error(`Position ${i + 1}: Menge ${nw.qty} unter bereits gelieferter Menge ${delivered}.`);
          await tx.orderLine.update({ where: { id: ex.id }, data: lineData(nw, i) }); // id erhalten (Lieferschein-Bezug)
        } else if (!ex && nw) {
          await tx.orderLine.create({ data: { orderId, ...lineData(nw, i) } });
        }
      }
    });
  }

  async createOrder(input: { number: string; companyId: string; quoteId?: string; lines: SalesLine[] }): Promise<{ id: string }> {
    const needsMaterialize = input.lines.some((l) => l.materializeArticle);
    return prisma.$transaction(async (tx) => {
      // Temporär erfasste Produktpositionen zu festen Artikeln machen (Article+Variant,
      // STANDARD-Preis = VK), dann die Auftragsposition mit der neuen Variante verknüpfen.
      const stdId = needsMaterialize
        ? (await tx.priceGroup.findFirst({ where: { kind: "STANDARD" }, select: { id: true } }))?.id ?? null
        : null;
      const variantByIndex = new Map<number, string>();
      for (let i = 0; i < input.lines.length; i++) {
        const m = input.lines[i]!.materializeArticle;
        if (!m) continue;
        const art = await tx.article.create({
          data: { sku: m.sku, name: m.name, isVeredelung: m.isVeredelung, variants: { create: { sku: m.sku } } },
          select: { variants: { select: { id: true } } },
        });
        const variantId = art.variants[0]!.id;
        variantByIndex.set(i, variantId);
        // STANDARD-Preis des neuen Artikels = VK-Liste (ohne den einmaligen Positionsrabatt).
        if (stdId) await tx.priceGroupPrice.create({ data: { variantId, priceGroupId: stdId, netCents: input.lines[i]!.listNetCents ?? input.lines[i]!.unitNetCents } });
      }
      const order = await tx.order.create({
        data: {
          number: input.number,
          companyId: input.companyId,
          quoteId: input.quoteId,
          status: "ANGELEGT",
          lines: { create: input.lines.map((l, i) => ({ position: i + 1, description: l.description, qty: l.qty, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents ?? null, rabattPct: l.rabattPct ?? null, taxRatePct: l.taxRatePct ?? 19, dbCents: l.dbCents ?? null, kind: (l.kind ?? "TEXTIL") as never, variantId: l.variantId ?? variantByIndex.get(i) ?? null, bezugPosition: l.bezugPosition ?? null, lineType: l.lineType ?? "ARTIKEL", placement: l.placement ?? null, altPreisText: l.altPreisText ?? null, imPdfAusblenden: l.imPdfAusblenden ?? false })) },
        },
        select: { id: true },
      });
      // Verfügbarkeits-Reservierung (Lager-Scheibe): jede variantengebundene Position reserviert
      // Bestand im Hauptlager, sodass „verfügbar" = Bestand − aktive Reservierungen die
      // Doppelvergabe desselben Bestands an mehrere Aufträge verhindert. Freigabe bei
      // Lieferung (verbraucht) bzw. Storno (s. delivery-/transition-Pfad).
      for (let i = 0; i < input.lines.length; i++) {
        const l = input.lines[i]!;
        const variantId = l.variantId ?? variantByIndex.get(i);
        if (!variantId || l.qty <= 0) continue;
        // Procure-to-Order: nur bestandsgeführte Artikel reservieren. Reine Druck-/Phantom-
        // artikel (bestandsgefuehrt=false, Default) erzeugen keine Reservierung/Minusbestand.
        const v = await tx.variant.findUnique({ where: { id: variantId }, select: { bestandsgefuehrtOverride: true, article: { select: { bestandsgefuehrt: true } } } });
        const managed = v ? (v.bestandsgefuehrtOverride ?? v.article.bestandsgefuehrt) : false;
        if (!managed) continue;
        await tx.stockReservation.create({ data: { variantId, lager: "HAUPT", warehouseId: "wh_haupt", qty: l.qty, orderId: order.id, belegRef: input.number, status: "AKTIV" } });
      }
      return order;
    });
  }

  async conversionPlan(quoteId: string): Promise<ConversionPlan | null> {
    const q = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        companyId: true,
        lines: {
          orderBy: { position: "asc" },
          select: { position: true, description: true, qty: true, unitNetCents: true, listNetCents: true, rabattPct: true, taxRatePct: true, dbCents: true, kind: true, articleId: true, variantId: true, isAlternative: true, bezugPosition: true, lineType: true, placement: true, altPreisText: true, imPdfAusblenden: true },
        },
      },
    });
    if (!q) return null;
    const existing = await prisma.order.findUnique({ where: { quoteId }, select: { id: true } });

    // articleId ist eine reine String-Spalte (keine Prisma-Relation) → Namen separat batchen.
    const articleIds = [...new Set(q.lines.map((l) => l.articleId).filter((x): x is string => !!x))];
    const articles = articleIds.length
      ? await prisma.article.findMany({ where: { id: { in: articleIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(articles.map((a) => [a.id, a.name]));

    return {
      companyId: q.companyId,
      existingOrderId: existing?.id ?? null,
      lines: q.lines.map((l) => ({
        position: l.position,
        description: l.description,
        qty: l.qty,
        unitNetCents: l.unitNetCents,
        listNetCents: l.listNetCents ?? null,
        rabattPct: l.rabattPct ?? null,
        taxRatePct: l.taxRatePct,
        kind: l.kind as PositionKind,
        articleId: l.articleId ?? null,
        articleName: l.articleId ? nameById.get(l.articleId) ?? null : null,
        variantId: l.variantId ?? null,
        isAlternative: l.isAlternative,
        bezugPosition: l.bezugPosition ?? null,
        dbCents: l.dbCents ?? null,
        lineType: l.lineType as import("@texma/shared").LineType,
        placement: l.placement,
        altPreisText: l.altPreisText,
        imPdfAusblenden: l.imPdfAusblenden,
        needsVariant: !!l.articleId && !l.variantId && !l.isAlternative,
      })),
    };
  }

  async markQuoteAccepted(quoteId: string): Promise<void> {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: "ANGENOMMEN" } });
  }
}
