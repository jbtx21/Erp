// Prisma-Implementierung der globalen Suche (G-6): entitätsübergreifend über die
// Kern-Stammdaten/Belege, case-insensitive, je Entität begrenzt.

import { prisma } from "@texma/db";
import type { SearchHit, SearchRepository } from "../modules/search/search.service.js";

export class PrismaSearchRepository implements SearchRepository {
  async search(query: string, limit: number): Promise<SearchHit[]> {
    const per = Math.max(3, Math.ceil(limit / 4));
    const ci = { contains: query, mode: "insensitive" as const };

    const [companies, suppliers, orders, variants, leads] = await Promise.all([
      prisma.company.findMany({ where: { name: ci }, take: per, select: { id: true, name: true, branche: true } }),
      prisma.supplier.findMany({ where: { name: ci }, take: per, select: { id: true, name: true, kind: true } }),
      prisma.order.findMany({
        where: { OR: [{ number: ci }, { externalNumber: ci }] },
        take: per, select: { id: true, number: true, status: true },
      }),
      prisma.variant.findMany({ where: { sku: ci }, take: per, select: { id: true, sku: true, articleId: true, article: { select: { name: true } } } }),
      prisma.lead.findMany({ where: { OR: [{ name: ci }, { email: ci }] }, take: per, select: { id: true, name: true, email: true } }),
    ]);

    const hits: SearchHit[] = [
      ...companies.map((c) => ({ entity: "Firma", id: c.id, label: c.name, sub: c.branche, navKey: "companies" })),
      ...suppliers.map((s) => ({ entity: "Lieferant", id: s.id, label: s.name, sub: s.kind, navKey: "suppliers" })),
      ...orders.map((o) => ({ entity: "Auftrag", id: o.id, label: o.number, sub: o.status, navKey: "orders" })),
      ...variants.map((v) => ({ entity: "Artikel", id: v.articleId, label: v.sku, sub: v.article.name, navKey: "products" })),
      ...leads.map((l) => ({ entity: "Lead", id: l.id, label: l.name, sub: l.email, navKey: "leads" })),
    ];
    return hits.slice(0, limit);
  }
}
