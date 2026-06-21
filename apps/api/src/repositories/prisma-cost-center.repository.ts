// Prisma-Implementierung der Kostenstellen (Produktionspfad, B7).

import { prisma } from "@texma/db";
import type { CostCenterRepository } from "../modules/cost-center/cost-center.service.js";

export class PrismaCostCenterRepository implements CostCenterRepository {
  async create(nummer: string, name: string): Promise<{ id: string; nummer: string }> {
    const cc = await prisma.costCenter.create({ data: { nummer, name }, select: { id: true, nummer: true } });
    return cc;
  }

  async assignInvoice(invoiceId: string, costCenterId: string | null): Promise<void> {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { costCenterId } });
  }

  async invoiceAmounts(): Promise<Array<{ costCenterId: string | null; amountCents: number }>> {
    const rows = await prisma.invoice.findMany({ select: { costCenterId: true, netCents: true } });
    return rows.map((r) => ({ costCenterId: r.costCenterId, amountCents: r.netCents }));
  }
}
