// Prisma-Auftragserstellung: manueller Auftrag + Angebot→Auftrag.

import { prisma } from "@texma/db";
import type { PositionKind } from "@texma/shared";
import type { ConversionPlan, SalesLine, SalesOrderRepository } from "../modules/sales/sales-order.service.js";

export class PrismaSalesOrderRepository implements SalesOrderRepository {
  async companyExists(companyId: string): Promise<boolean> {
    return (await prisma.company.count({ where: { id: companyId } })) > 0;
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
      return tx.order.create({
        data: {
          number: input.number,
          companyId: input.companyId,
          quoteId: input.quoteId,
          status: "ANGELEGT",
          lines: { create: input.lines.map((l, i) => ({ position: i + 1, description: l.description, qty: l.qty, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents ?? null, rabattPct: l.rabattPct ?? null, dbCents: l.dbCents ?? null, kind: (l.kind ?? "TEXTIL") as never, variantId: l.variantId ?? variantByIndex.get(i) ?? null })) },
        },
        select: { id: true },
      });
    });
  }

  async conversionPlan(quoteId: string): Promise<ConversionPlan | null> {
    const q = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        companyId: true,
        lines: {
          orderBy: { position: "asc" },
          select: { position: true, description: true, qty: true, unitNetCents: true, listNetCents: true, rabattPct: true, dbCents: true, kind: true, articleId: true, variantId: true, isAlternative: true },
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
        kind: l.kind as PositionKind,
        articleId: l.articleId ?? null,
        articleName: l.articleId ? nameById.get(l.articleId) ?? null : null,
        variantId: l.variantId ?? null,
        isAlternative: l.isAlternative,
        dbCents: l.dbCents ?? null,
        needsVariant: !!l.articleId && !l.variantId && !l.isAlternative,
      })),
    };
  }

  async markQuoteAccepted(quoteId: string): Promise<void> {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: "ANGENOMMEN" } });
  }
}
