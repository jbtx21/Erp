// Prisma-Implementierung des vereinheitlichten Abgleich-Lesemodells (Kap. 9.4).
// Liest Zahlungen (mit Herkunft + Allokationen) und offene Posten (mit Firmen-/
// Rechnungsbezug) aus den gemeinsamen Tabellen — reiner Lesepfad, keine Mutation.

import { prisma } from "@texma/db";
import type {
  ReconciliationRepository, ReconPaymentRow, ReconOpenItemRow,
} from "../modules/reconciliation/reconciliation.service.js";

export class PrismaReconciliationRepository implements ReconciliationRepository {
  async listPayments(limit: number): Promise<ReconPaymentRow[]> {
    const rows = await prisma.payment.findMany({
      orderBy: { bookedAt: "desc" },
      take: limit,
      select: {
        id: true, source: true, externalRef: true, reference: true, amountCents: true, bookedAt: true,
        allocations: {
          select: {
            amountCents: true, openItemId: true,
            openItem: { select: { invoice: { select: { number: true, company: { select: { name: true } } } } } },
          },
        },
      },
    });
    return rows.map((p) => ({
      id: p.id, source: p.source, externalRef: p.externalRef, reference: p.reference,
      amountCents: p.amountCents, bookedAt: p.bookedAt,
      allocations: p.allocations.map((a) => ({
        openItemId: a.openItemId,
        invoiceNumber: a.openItem.invoice.number,
        companyName: a.openItem.invoice.company.name,
        amountCents: a.amountCents,
      })),
    }));
  }

  async listOpenItems(): Promise<ReconOpenItemRow[]> {
    const rows = await prisma.openItem.findMany({
      where: { openCents: { gt: 0 } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true, openCents: true, dueDate: true, dunningLevel: true,
        invoice: { select: { number: true, grossCents: true, company: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id, invoiceNumber: r.invoice.number, companyName: r.invoice.company.name,
      openCents: r.openCents, grossCents: r.invoice.grossCents, dueDate: r.dueDate, dunningLevel: r.dunningLevel,
    }));
  }
}
