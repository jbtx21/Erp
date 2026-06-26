// Prisma-Implementierung der Banking-Repositories (Produktionspfad, T-13).
// Persistiert Zahlungen + Allokationen in EINER Transaktion und schreibt die OP-Rest-
// beträge fort. Idempotenz über das Unique `Payment.externalRef`.

import { prisma } from "@texma/db";
import type { OpenItemRef } from "@texma/shared";
import type {
  BankingRepository,
  PersistablePayment,
} from "../modules/banking/banking-import.service.js";
import type { BankingClarificationItem, BankingQueryRepository, BankingStatementEntry } from "./read.js";

export class PrismaBankingRepository implements BankingRepository, BankingQueryRepository {
  async existingExternalRefs(refs: string[]): Promise<Set<string>> {
    if (refs.length === 0) return new Set();
    const rows = await prisma.payment.findMany({
      where: { externalRef: { in: refs } },
      select: { externalRef: true },
    });
    return new Set(rows.map((r) => r.externalRef).filter((r): r is string => r != null));
  }

  async listOpenItems(): Promise<OpenItemRef[]> {
    const rows = await prisma.openItem.findMany({
      where: { openCents: { gt: 0 } },
      select: { id: true, openCents: true, invoice: { select: { number: true } } },
    });
    return rows.map((r) => ({ id: r.id, invoiceNumber: r.invoice.number, openCents: r.openCents }));
  }

  async persist(payments: PersistablePayment[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const p of payments) {
        const payment = await tx.payment.create({
          data: {
            externalRef: p.externalRef,
            source: p.source,
            amountCents: p.amountCents,
            reference: p.reference,
            matched: p.matched,
          },
          select: { id: true },
        });
        for (const a of p.allocations) {
          await tx.paymentAllocation.create({
            data: { paymentId: payment.id, openItemId: a.openItemId, amountCents: a.allocatedCents },
          });
          await tx.openItem.update({
            where: { id: a.openItemId },
            data: { openCents: { decrement: a.allocatedCents } },
          });
        }
      }
    });
  }

  async listClarifications(limit: number): Promise<BankingClarificationItem[]> {
    return prisma.payment.findMany({
      where: { matched: false },
      orderBy: { bookedAt: "desc" },
      take: limit,
      select: { id: true, externalRef: true, amountCents: true, reference: true, bookedAt: true },
    });
  }

  async listStatementEntries(limit: number): Promise<BankingStatementEntry[]> {
    return prisma.payment.findMany({
      orderBy: { bookedAt: "desc" },
      take: limit,
      select: { id: true, externalRef: true, amountCents: true, reference: true, matched: true, source: true, bookedAt: true },
    });
  }
}
