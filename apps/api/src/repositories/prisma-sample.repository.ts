// Prisma-Implementierung des Muster-Leihguts (Produktionspfad, B5). Ausgabe/Rückgabe
// schreiben den Muster-Lagerstand (F4-Ledger, lager=MUSTER) und die DueItem-Frist;
// die Berechnung erzeugt eine Musterrechnung (ohne Auftrag) zum Listenpreis.

import { prisma } from "@texma/db";
import {
  isSampleOverdue,
  lineNet,
  resolvePrice,
  type PriceGroupKind,
  type VariantPrice,
} from "@texma/shared";
import type {
  LoanLine,
  OverdueSampleLoan,
  SampleInvoiceData,
  SampleLoanRepository,
  SampleLoanRow,
} from "../modules/sample/sample.service.js";

export class PrismaSampleLoanRepository implements SampleLoanRepository {
  async list(): Promise<SampleLoanRow[]> {
    const rows = await prisma.sampleLoan.findMany({
      orderBy: { ausgegebenAm: "desc" },
      select: { id: true, companyId: true, variantId: true, menge: true, zweck: true, ausgegebenAm: true, status: true, invoiceId: true, lines: { select: { description: true, variantId: true, supplierId: true, menge: true } } },
    });
    return rows.map((r) => ({ ...r, lines: r.lines as LoanLine[] }));
  }

  async issueMulti(input: { companyId: string; zweck: string | null; ausgegebenAm: Date; lines: LoanLine[] }): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const loan = await tx.sampleLoan.create({
        data: {
          companyId: input.companyId, zweck: input.zweck, ausgegebenAm: input.ausgegebenAm,
          lines: { create: input.lines.map((l) => ({ description: l.description, variantId: l.variantId ?? null, supplierId: l.supplierId ?? null, menge: l.menge })) },
        },
        select: { id: true },
      });
      // Muster-Abgang nur für Katalog-Varianten (mit variantId).
      for (const l of input.lines) {
        if (l.variantId) await tx.stockMove.create({ data: { variantId: l.variantId, deltaQty: -l.menge, grund: "MUSTER", lager: "MUSTER", belegRef: `SampleLoan:${loan.id}` } });
      }
      await tx.dueItem.create({ data: { entity: "SampleLoan", entityId: loan.id, dueDate: input.ausgegebenAm, note: "Muster/Anprobe-Rückgabe" } });
      return loan;
    });
  }

  async quoteForLoan(quoteId: string): Promise<{ companyId: string; lines: LoanLine[] } | null> {
    const q = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { companyId: true, lines: { orderBy: { position: "asc" }, select: { description: true, qty: true } } },
    });
    if (!q) return null;
    return { companyId: q.companyId, lines: q.lines.map((l) => ({ description: l.description, menge: l.qty, variantId: null, supplierId: null })) };
  }

  async issue(input: {
    companyId: string;
    variantId: string;
    menge: number;
    ausgegebenAm: Date;
    dueDate: Date;
  }): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const loan = await tx.sampleLoan.create({
        data: {
          companyId: input.companyId,
          variantId: input.variantId,
          menge: input.menge,
          ausgegebenAm: input.ausgegebenAm,
        },
        select: { id: true },
      });
      await tx.stockMove.create({
        data: {
          variantId: input.variantId,
          deltaQty: -input.menge,
          grund: "MUSTER",
          lager: "MUSTER",
          belegRef: `SampleLoan:${loan.id}`,
        },
      });
      await tx.dueItem.create({
        data: { entity: "SampleLoan", entityId: loan.id, dueDate: input.dueDate, note: "Muster-Rückgabefrist (21 Tage)" },
      });
      return loan;
    });
  }

  async markReturned(loanId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const loan = await tx.sampleLoan.findUnique({
        where: { id: loanId },
        select: { status: true, variantId: true, menge: true },
      });
      if (!loan || loan.status !== "VERLIEHEN") return;
      await tx.sampleLoan.update({ where: { id: loanId }, data: { status: "ZURUECK" } });
      if (loan.variantId && loan.menge) {
        await tx.stockMove.create({
          data: { variantId: loan.variantId, deltaQty: loan.menge, grund: "MUSTER", lager: "MUSTER", belegRef: `SampleLoan:${loanId}` },
        });
      }
      // Mehrartikel-Leihe: Muster-Zugang je Katalogposition.
      const lines = await tx.sampleLoanLine.findMany({ where: { sampleLoanId: loanId, variantId: { not: null } }, select: { variantId: true, menge: true } });
      for (const l of lines) {
        if (l.variantId) await tx.stockMove.create({ data: { variantId: l.variantId, deltaQty: l.menge, grund: "MUSTER", lager: "MUSTER", belegRef: `SampleLoan:${loanId}` } });
      }
      await tx.dueItem.updateMany({ where: { entity: "SampleLoan", entityId: loanId }, data: { done: true } });
    });
  }

  async listDueForBilling(now: Date): Promise<OverdueSampleLoan[]> {
    const loans = await prisma.sampleLoan.findMany({
      // Nur Einzel-Leihen mit Variante/Menge werden automatisch berechnet (Mehrartikel-
      // Muster/Anprobe nicht zum Listenpreis fakturiert).
      where: { status: "VERLIEHEN", variantId: { not: null }, menge: { not: null } },
      select: { id: true, companyId: true, variantId: true, menge: true, ausgegebenAm: true, status: true },
    });
    return loans
      .filter((l) => isSampleOverdue({ ausgegebenAm: l.ausgegebenAm, status: l.status }, now))
      .map((l) => ({ id: l.id, companyId: l.companyId, variantId: l.variantId as string, menge: l.menge as number, ausgegebenAm: l.ausgegebenAm }));
  }

  async listPriceCents(companyId: string, variantId: string, menge: number): Promise<number> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { priceGroup: { select: { kind: true } } },
    });
    if (!company) throw new Error(`Company ${companyId} nicht gefunden`);
    const prices = await prisma.priceGroupPrice.findMany({
      where: { variantId },
      select: { netCents: true, priceGroup: { select: { kind: true } } },
    });
    const variantPrices: VariantPrice[] = prices.map((p) => ({
      priceGroup: p.priceGroup.kind as PriceGroupKind,
      netCents: p.netCents,
    }));
    const unit = resolvePrice(variantPrices, company.priceGroup.kind as PriceGroupKind);
    return lineNet(menge, unit);
  }

  async bill(loanId: string, invoice: SampleInvoiceData): Promise<{ invoiceId: string }> {
    return prisma.$transaction(async (tx) => {
      const loan = await tx.sampleLoan.findUnique({ where: { id: loanId }, select: { companyId: true } });
      if (!loan) throw new Error(`SampleLoan ${loanId} nicht gefunden`);
      const created = await tx.invoice.create({
        data: {
          number: invoice.number,
          companyId: loan.companyId,
          netCents: invoice.netCents,
          taxCents: invoice.taxCents,
          grossCents: invoice.grossCents,
          finalized: true,
        },
        select: { id: true },
      });
      await tx.sampleLoan.update({ where: { id: loanId }, data: { status: "BERECHNET", invoiceId: created.id } });
      await tx.dueItem.updateMany({ where: { entity: "SampleLoan", entityId: loanId }, data: { done: true } });
      return { invoiceId: created.id };
    });
  }
}
