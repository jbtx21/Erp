// Prisma-Auftragserstellung: manueller Auftrag + Angebot→Auftrag.

import { prisma } from "@texma/db";
import type { SalesLine, SalesOrderRepository } from "../modules/sales/sales-order.service.js";

export class PrismaSalesOrderRepository implements SalesOrderRepository {
  async companyExists(companyId: string): Promise<boolean> {
    return (await prisma.company.count({ where: { id: companyId } })) > 0;
  }

  async createOrder(input: { number: string; companyId: string; quoteId?: string; lines: SalesLine[] }): Promise<{ id: string }> {
    const order = await prisma.order.create({
      data: {
        number: input.number,
        companyId: input.companyId,
        quoteId: input.quoteId,
        status: "ANGELEGT",
        lines: { create: input.lines.map((l, i) => ({ position: i + 1, description: l.description, qty: l.qty, unitNetCents: l.unitNetCents, kind: (l.kind ?? "TEXTIL") as never })) },
      },
      select: { id: true },
    });
    return order;
  }

  async quoteForConversion(quoteId: string): Promise<{ companyId: string; existingOrderId: string | null; lines: SalesLine[] } | null> {
    const q = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { companyId: true, lines: { orderBy: { position: "asc" }, select: { description: true, qty: true, unitNetCents: true, kind: true } } },
    });
    if (!q) return null;
    const existing = await prisma.order.findUnique({ where: { quoteId }, select: { id: true } });
    return { companyId: q.companyId, existingOrderId: existing?.id ?? null, lines: q.lines };
  }

  async markQuoteAccepted(quoteId: string): Promise<void> {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: "ANGENOMMEN" } });
  }
}
