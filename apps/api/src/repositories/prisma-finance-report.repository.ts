// Prisma-Implementierung des Finanz-Reportings (Produktionspfad, B19).

import { prisma } from "@texma/db";
import type { AgingItem } from "@texma/shared";
import type { FinanceReportRepository } from "../modules/finance-report/finance-report.service.js";

export class PrismaFinanceReportRepository implements FinanceReportRepository {
  async listOpenItems(): Promise<AgingItem[]> {
    const rows = await prisma.openItem.findMany({
      where: { openCents: { gt: 0 } },
      select: { openCents: true, dueDate: true },
    });
    return rows.map((r) => ({ openCents: r.openCents, dueDate: r.dueDate }));
  }

  async revenueNetCents(from: Date, to: Date): Promise<number> {
    const agg = await prisma.invoice.aggregate({
      where: { finalized: true, issuedAt: { gte: from, lt: to } },
      _sum: { netCents: true },
    });
    return agg._sum.netCents ?? 0;
  }

  async revenueGrossCents(from: Date, to: Date): Promise<number> {
    const agg = await prisma.invoice.aggregate({
      where: { finalized: true, issuedAt: { gte: from, lt: to } },
      _sum: { grossCents: true },
    });
    return agg._sum.grossCents ?? 0;
  }
}
