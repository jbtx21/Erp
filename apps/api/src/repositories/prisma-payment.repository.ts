// Prisma-Zahlungs-Repository (Kap. 9.4): offene Posten + manuelle Zahlungsbuchung
// (Payment + PaymentAllocation, openCents-Minderung) in einer Transaktion.

import { prisma } from "@texma/db";
import type { OpenItemRow, PaymentRepository } from "../modules/payment/payment.service.js";

export class PrismaPaymentRepository implements PaymentRepository {
  async listOpenItems(): Promise<OpenItemRow[]> {
    const rows = await prisma.openItem.findMany({
      where: { openCents: { gt: 0 } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true, openCents: true, dueDate: true, dunningLevel: true,
        invoice: { select: { id: true, number: true, grossCents: true, company: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      invoiceId: r.invoice.id,
      invoiceNumber: r.invoice.number,
      companyName: r.invoice.company.name,
      openCents: r.openCents,
      grossCents: r.invoice.grossCents,
      dueDate: r.dueDate,
      dunningLevel: r.dunningLevel,
    }));
  }

  async getOpenItem(openItemId: string): Promise<{ id: string; openCents: number } | null> {
    return prisma.openItem.findUnique({ where: { id: openItemId }, select: { id: true, openCents: true } });
  }

  async recordPayment(input: { openItemId: string; amountCents: number; bookedAt: Date; reference: string | null }): Promise<{ newOpenCents: number }> {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { amountCents: input.amountCents, bookedAt: input.bookedAt, reference: input.reference, matched: true },
        select: { id: true },
      });
      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, openItemId: input.openItemId, amountCents: input.amountCents },
      });
      const updated = await tx.openItem.update({
        where: { id: input.openItemId },
        data: { openCents: { decrement: input.amountCents } },
        select: { openCents: true },
      });
      return { newOpenCents: updated.openCents };
    });
  }
}
