// Prisma-DATEV-Export-Repository (Kap. 9.2). Lädt finalisierte Ausgangsrechnungen und
// Gutschriften einer Periode samt Debitorenkonto des Kunden bzw. Originalrechnungs-Bezug.

import { prisma } from "@texma/db";
import type {
  DatevCreditNoteRow,
  DatevExportRepository,
  DatevInvoiceRow,
} from "../modules/datev-export/datev-export.service.js";

export class PrismaDatevExportRepository implements DatevExportRepository {
  async invoicesInPeriod(from: Date, to: Date): Promise<DatevInvoiceRow[]> {
    const rows = await prisma.invoice.findMany({
      where: { finalized: true, issuedAt: { gte: from, lte: to } },
      orderBy: { issuedAt: "asc" },
      select: {
        number: true, issuedAt: true, netCents: true, taxCents: true,
        company: { select: { debitorenkonto: true } },
      },
    });
    return rows.map((r) => ({
      number: r.number, issuedAt: r.issuedAt, netCents: r.netCents, taxCents: r.taxCents,
      debitorKonto: r.company.debitorenkonto ?? null,
    }));
  }

  async creditNotesInPeriod(from: Date, to: Date): Promise<DatevCreditNoteRow[]> {
    const rows = await prisma.creditNote.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "asc" },
      select: {
        number: true, createdAt: true, amountCents: true,
        invoice: { select: { number: true, netCents: true, taxCents: true, company: { select: { debitorenkonto: true } } } },
      },
    });
    return rows.map((r) => ({
      number: r.number, createdAt: r.createdAt, amountCents: r.amountCents,
      debitorKonto: r.invoice.company.debitorenkonto ?? null,
      invoiceNumber: r.invoice.number,
      invoiceNetCents: r.invoice.netCents,
      invoiceTaxCents: r.invoice.taxCents,
    }));
  }
}
