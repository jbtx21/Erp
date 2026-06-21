// Prisma-Implementierung des Nachkalkulations-Repositories (Produktionspfad, T-10).
// Ist: Umsatz aus den Auftragspositionen, Material aus den Bestellpositionen der PA
// (PO→productionId), Lohn-Minuten aus der Zeiterfassung.

import { prisma } from "@texma/db";
import type { CostSide } from "@texma/shared";
import type { PostCalcRepository } from "../modules/postcalc/postcalc.service.js";

export class PrismaPostCalcRepository implements PostCalcRepository {
  async actuals(productionId: string, laborRateCentsPerMinute: number): Promise<CostSide | null> {
    const prod = await prisma.productionOrder.findUnique({
      where: { id: productionId },
      select: { order: { select: { lines: { select: { qty: true, unitNetCents: true } } } } },
    });
    if (!prod) return null;

    const revenueCents = prod.order.lines.reduce((s, l) => s + l.qty * l.unitNetCents, 0);

    const poLines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { productionId } },
      select: { qty: true, ekCents: true },
    });
    const materialCents = poLines.reduce((s, l) => s + l.qty * l.ekCents, 0);

    const time = await prisma.timeEntry.aggregate({ where: { productionId }, _sum: { minutes: true } });
    const laborMinutes = time._sum.minutes ?? 0;

    return { revenueCents, materialCents, laborMinutes, laborRateCentsPerMinute };
  }
}
