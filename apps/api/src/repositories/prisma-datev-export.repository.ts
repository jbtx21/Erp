// Prisma-DATEV-Export-Repository (Kap. 9.2). Lädt finalisierte Ausgangsrechnungen,
// Gutschriften und Eingangsrechnungen/Verbindlichkeiten einer Periode samt Kontierung
// (Debitoren-/Kreditoren-/Aufwandskonto) und führt das „bereits exportiert"-Protokoll.

import { prisma } from "@texma/db";
import type {
  DatevCreditNoteRow,
  DatevExportRepository,
  DatevIncomingInvoiceRow,
  DatevInvoiceRow,
} from "../modules/datev-export/datev-export.service.js";

export class PrismaDatevExportRepository implements DatevExportRepository {
  async invoicesInPeriod(from: Date, to: Date): Promise<DatevInvoiceRow[]> {
    const rows = await prisma.invoice.findMany({
      where: { finalized: true, issuedAt: { gte: from, lte: to } },
      orderBy: { issuedAt: "asc" },
      select: {
        number: true, issuedAt: true, netCents: true, taxCents: true,
        company: { select: { debitorenkonto: true, customerNumber: true } },
      },
    });
    return rows.map((r) => ({
      number: r.number, issuedAt: r.issuedAt, netCents: r.netCents, taxCents: r.taxCents,
      debitorKonto: r.company.debitorenkonto ?? null,
      belegfeld2: r.company.customerNumber ?? null,
    }));
  }

  async creditNotesInPeriod(from: Date, to: Date): Promise<DatevCreditNoteRow[]> {
    const rows = await prisma.creditNote.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "asc" },
      select: {
        number: true, createdAt: true, amountCents: true,
        invoice: { select: { number: true, netCents: true, taxCents: true, company: { select: { debitorenkonto: true, customerNumber: true } } } },
      },
    });
    return rows.map((r) => ({
      number: r.number, createdAt: r.createdAt, amountCents: r.amountCents,
      debitorKonto: r.invoice.company.debitorenkonto ?? null,
      invoiceNumber: r.invoice.number,
      invoiceNetCents: r.invoice.netCents,
      invoiceTaxCents: r.invoice.taxCents,
      belegfeld2: r.invoice.company.customerNumber ?? null,
    }));
  }

  /** Freigegebene/bezahlte Eingangsrechnungen der Periode (kreditorische Buchung). */
  async incomingInvoicesInPeriod(from: Date, to: Date): Promise<DatevIncomingInvoiceRow[]> {
    const rows = await prisma.incomingInvoice.findMany({
      where: {
        status: { in: ["FREIGEGEBEN", "BEZAHLT"] },
        OR: [{ issueDate: { gte: from, lte: to } }, { issueDate: null, receivedAt: { gte: from, lte: to } }],
      },
      orderBy: [{ issueDate: "asc" }, { receivedAt: "asc" }],
      select: {
        id: true, number: true, issueDate: true, receivedAt: true, netCents: true, taxCents: true,
        supplier: { select: { name: true, kreditorenkonto: true, aufwandskonto: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id, number: r.number, issuedAt: r.issueDate ?? r.receivedAt,
      netCents: r.netCents, taxCents: r.taxCents,
      kreditorKonto: r.supplier.kreditorenkonto ?? null,
      aufwandskonto: r.supplier.aufwandskonto ?? null,
      supplierName: r.supplier.name,
    }));
  }

  async existingExportedKeys(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const parsed = keys.map((k) => {
      const idx = k.indexOf(":");
      return { belegart: k.slice(0, idx), belegKey: k.slice(idx + 1) };
    });
    const rows = await prisma.datevExportEntry.findMany({
      where: { OR: parsed },
      select: { belegart: true, belegKey: true },
    });
    return new Set(rows.map((r) => `${r.belegart}:${r.belegKey}`));
  }

  async recordExported(entries: ReadonlyArray<{ belegart: string; belegKey: string }>, filename: string): Promise<void> {
    if (entries.length === 0) return;
    await prisma.datevExportEntry.createMany({
      data: entries.map((e) => ({ belegart: e.belegart, belegKey: e.belegKey, filename })),
      skipDuplicates: true,
    });
  }
}
