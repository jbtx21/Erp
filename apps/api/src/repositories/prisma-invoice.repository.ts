// Prisma-Invoice-Repo (Produktionspfad): Order → Invoice Make-Target. Erzeugt Rechnung
// + offenen Posten und schreibt den Auftragsstatus (fakturastatus/status) in EINER
// Transaktion zurück (Konsistenz der berechneten Erfüllungsstatus, ERPNext-Muster).
import { prisma } from "@texma/db";
import type { InvoiceRepository, OrderForInvoice } from "../modules/invoice/invoice.service.js";

export class PrismaInvoiceRepository implements InvoiceRepository {
  async loadOrderForInvoice(orderId: string): Promise<OrderForInvoice | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: { orderBy: { position: "asc" } }, company: { select: { zahlungszielTage: true } }, invoice: { select: { id: true } } },
    });
    if (!o) return null;
    return {
      id: o.id,
      number: o.number,
      companyId: o.companyId,
      zahlungszielTage: o.company.zahlungszielTage,
      alreadyInvoicedId: o.invoice?.id ?? null,
      lines: o.lines.map((l) => ({ description: l.description, qty: l.qty, unitNetCents: l.unitNetCents })),
    };
  }

  async createInvoiceFromOrder(input: { orderId: string; companyId: string; number: string; netCents: number; taxCents: number; grossCents: number; dueDate: Date }): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number: input.number,
          orderId: input.orderId,
          companyId: input.companyId,
          netCents: input.netCents,
          taxCents: input.taxCents,
          grossCents: input.grossCents,
          finalized: true,
        },
        select: { id: true },
      });
      // Offener Posten (Forderung) — Grundlage für Banking-Abgleich/Mahnwesen.
      await tx.openItem.create({ data: { invoiceId: invoice.id, openCents: input.grossCents, dueDate: input.dueDate } });
      // Fortschritts-Rückmeldung an den Auftrag (per_billed = 100 %).
      await tx.order.update({ where: { id: input.orderId }, data: { fakturastatus: "VOLL", status: "FAKTURIERT" } });
      return { id: invoice.id };
    });
  }

  async loadInvoiceForCredit(invoiceId: string): Promise<import("../modules/invoice/invoice.service.js").InvoiceForCredit | null> {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { creditNotes: { select: { amountCents: true } } } });
    if (!inv) return null;
    return {
      id: inv.id,
      number: inv.number,
      grossCents: inv.grossCents,
      finalized: inv.finalized,
      orderId: inv.orderId,
      alreadyCreditedCents: inv.creditNotes.reduce((s, c) => s + c.amountCents, 0),
    };
  }

  async createCreditNoteAndNeutralize(input: { invoiceId: string; orderId: string | null; number: string; amountCents: number; reason: string; restock: boolean }): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const cn = await tx.creditNote.create({ data: { number: input.number, invoiceId: input.invoiceId, amountCents: input.amountCents, reason: input.reason }, select: { id: true } });
      // Offenen Posten neutralisieren (Forderung entfällt) — Rechnung selbst bleibt WORM.
      await tx.openItem.updateMany({ where: { invoiceId: input.invoiceId }, data: { openCents: 0 } });
      if (input.orderId) await tx.order.update({ where: { id: input.orderId }, data: { fakturastatus: "NICHT" } });
      // Retoure: gelieferte Mengen des Auftrags als Lager-Zugang (KORREKTUR) zurückbuchen —
      // kehrt genau den Versand-Abgang um (nur was physisch ausging, kommt zurück).
      if (input.restock && input.orderId) {
        const delivered = await tx.deliveryNoteLine.findMany({
          where: { deliveryNote: { orderId: input.orderId }, orderLine: { variantId: { not: null } } },
          select: { qty: true, orderLine: { select: { variantId: true } } },
        });
        const byVariant = new Map<string, number>();
        for (const d of delivered) { const v = d.orderLine.variantId!; byVariant.set(v, (byVariant.get(v) ?? 0) + d.qty); }
        for (const [variantId, qty] of byVariant) {
          if (qty <= 0) continue;
          await tx.stockMove.create({ data: { variantId, deltaQty: qty, grund: "KORREKTUR", lager: "HAUPT", warehouseId: "wh_haupt", belegRef: `CreditNote:${input.number}` } });
          await tx.stockLevel.upsert({ where: { variantId }, create: { variantId, qty }, update: { qty: { increment: qty } } });
        }
      }
      return { id: cn.id };
    });
  }

  async listRecent(limit: number): Promise<Array<{ id: string; number: string; orderId: string | null; companyId: string; netCents: number; taxCents: number; grossCents: number; openCents: number | null; dueDate: Date | null; issuedAt: Date }>> {
    const rows = await prisma.invoice.findMany({
      orderBy: { issuedAt: "desc" }, take: limit,
      select: { id: true, number: true, orderId: true, companyId: true, netCents: true, taxCents: true, grossCents: true, issuedAt: true, openItem: { select: { openCents: true, dueDate: true } } },
    });
    return rows.map((r) => {
      const { openItem, ...rest } = r;
      return { ...rest, openCents: openItem?.openCents ?? null, dueDate: openItem?.dueDate ?? null };
    });
  }
}
