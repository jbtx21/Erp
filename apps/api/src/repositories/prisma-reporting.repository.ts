// Prisma-Implementierung des Reporting-Repositories (Kap. 29). Umsatz-Datenpunkte aus
// finalisierten Rechnungen (Netto, Rechnungsdatum); Auftrags-Datenpunkte aus Aufträgen
// (Auftragsdatum + Summe der Positionen). Read-only — keine Mutationen.

import { prisma } from "@texma/db";
import type { OrderPoint, RevenuePoint } from "@texma/shared";
import type { ReportingRepository } from "../modules/reporting/reporting.service.js";

export class PrismaReportingRepository implements ReportingRepository {
  async revenuePoints(): Promise<RevenuePoint[]> {
    // Nur finalisierte Rechnungen zählen als realisierter Umsatz (Kap. 9/19).
    const invoices = await prisma.invoice.findMany({
      where: { finalized: true },
      select: { issuedAt: true, netCents: true },
    });
    return invoices.map((i) => ({ at: i.issuedAt, netCents: i.netCents }));
  }

  async orderPoints(): Promise<OrderPoint[]> {
    const orders = await prisma.order.findMany({
      select: { createdAt: true, lines: { select: { qty: true, unitNetCents: true } } },
    });
    return orders.map((o) => ({
      at: o.createdAt,
      netCents: o.lines.reduce((sum, l) => sum + l.qty * l.unitNetCents, 0),
    }));
  }
}
