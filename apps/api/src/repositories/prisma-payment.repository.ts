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
        data: { amountCents: input.amountCents, bookedAt: input.bookedAt, reference: input.reference, matched: true, source: "MANUAL" },
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

  async getPaymentForAssign(paymentId: string): Promise<{ amountCents: number; allocatedCents: number } | null> {
    const p = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { amountCents: true, allocations: { select: { amountCents: true } } },
    });
    if (!p) return null;
    return { amountCents: p.amountCents, allocatedCents: p.allocations.reduce((s, a) => s + a.amountCents, 0) };
  }

  async assignPaymentToOpenItem(input: { paymentId: string; openItemId: string; amountCents: number }): Promise<{ newOpenCents: number; paymentFullyMatched: boolean }> {
    return prisma.$transaction(async (tx) => {
      // Doppelzuordnung derselben Zahlung auf denselben OP abfangen (klare Meldung statt P2002).
      const dup = await tx.paymentAllocation.findUnique({
        where: { paymentId_openItemId: { paymentId: input.paymentId, openItemId: input.openItemId } },
        select: { id: true },
      });
      if (dup) throw new Error("Diese Zahlung ist diesem offenen Posten bereits zugeordnet.");

      await tx.paymentAllocation.create({
        data: { paymentId: input.paymentId, openItemId: input.openItemId, amountCents: input.amountCents },
      });
      const updated = await tx.openItem.update({
        where: { id: input.openItemId },
        data: { openCents: { decrement: input.amountCents } },
        select: { openCents: true },
      });
      // matched neu bestimmen: vollständig zugeordnet, wenn die Allokationen den Zahlbetrag decken.
      const pay = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { amountCents: true, allocations: { select: { amountCents: true } } } });
      const allocated = pay?.allocations.reduce((s, a) => s + a.amountCents, 0) ?? 0;
      const paymentFullyMatched = !!pay && allocated >= pay.amountCents;
      await tx.payment.update({ where: { id: input.paymentId }, data: { matched: paymentFullyMatched } });
      return { newOpenCents: updated.openCents, paymentFullyMatched };
    });
  }
}
