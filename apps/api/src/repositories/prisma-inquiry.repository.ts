// Prisma-Implementierung des Anfrage-Funnels (Produktionspfad, B20).

import { prisma } from "@texma/db";
import type { InquiryStatus } from "@texma/shared";
import type {
  CreateInquiryInput,
  InquiryRepository,
} from "../modules/inquiry/inquiry.service.js";

export class PrismaInquiryRepository implements InquiryRepository {
  async create(input: CreateInquiryInput & { number: string }): Promise<{ id: string }> {
    return prisma.inquiry.create({
      data: {
        number: input.number,
        quelle: input.quelle,
        text: input.text,
        companyId: input.companyId ?? null,
        kontaktName: input.kontaktName ?? null,
      },
      select: { id: true },
    });
  }

  async load(id: string): Promise<{ status: InquiryStatus; companyId: string | null } | null> {
    const i = await prisma.inquiry.findUnique({ where: { id }, select: { status: true, companyId: true } });
    return i ? { status: i.status as InquiryStatus, companyId: i.companyId } : null;
  }

  async setStatus(id: string, status: InquiryStatus): Promise<void> {
    await prisma.inquiry.update({ where: { id }, data: { status } });
  }

  async discard(id: string, grund: string): Promise<void> {
    await prisma.inquiry.update({ where: { id }, data: { status: "VERWORFEN", verworfenGrund: grund } });
  }

  async convertToQuote(id: string, input: { quoteNumber: string; companyId: string }): Promise<{ quoteId: string }> {
    return prisma.$transaction(async (tx) => {
      // Atomarer Gate: nur konvertieren, wenn noch offen. Ein paralleler Zweitlauf
      // (Doppelklick/Retry) trifft 0 Zeilen und bricht ab -> keine verwaiste Quote.
      const gate = await tx.inquiry.updateMany({
        where: { id, status: { in: ["NEU", "IN_BEARBEITUNG"] } },
        data: { status: "ANGEBOT" },
      });
      if (gate.count === 0) {
        throw new Error(`Anfrage ${id} ist bereits konvertiert oder nicht konvertierbar`);
      }
      const quote = await tx.quote.create({
        data: { number: input.quoteNumber, companyId: input.companyId, status: "ENTWURF" },
        select: { id: true },
      });
      await tx.inquiry.update({ where: { id }, data: { quoteId: quote.id } });
      return { quoteId: quote.id };
    });
  }
}
