import { prisma } from "@texma/db";
import type { CrmStage } from "@texma/shared";
import type { CreateCrmLeadInput, CrmLeadRecord, CrmRepository } from "../modules/crm/crm.service.js";

const VIEW = {
  id: true, name: true, companyId: true, contactName: true, email: true, phone: true,
  source: true, stage: true, valueCents: true, probability: true, expectedCloseAt: true,
  text: true, note: true, lostReason: true, quoteId: true, createdAt: true,
} as const;

export class PrismaCrmRepository implements CrmRepository {
  async list(): Promise<CrmLeadRecord[]> {
    return prisma.crmLead.findMany({ orderBy: { createdAt: "desc" }, select: VIEW }) as Promise<CrmLeadRecord[]>;
  }
  async load(id: string): Promise<CrmLeadRecord | null> {
    return prisma.crmLead.findUnique({ where: { id }, select: VIEW }) as Promise<CrmLeadRecord | null>;
  }
  async create(input: CreateCrmLeadInput & { stage: CrmStage }): Promise<CrmLeadRecord> {
    return prisma.crmLead.create({
      data: {
        name: input.name, companyId: input.companyId ?? null, contactName: input.contactName ?? null,
        email: input.email ?? null, phone: input.phone ?? null, source: input.source ?? null,
        valueCents: input.valueCents ?? null, text: input.text ?? null, note: input.note ?? null, stage: input.stage,
      },
      select: VIEW,
    }) as Promise<CrmLeadRecord>;
  }
  async setStage(id: string, stage: CrmStage, lostReason: string | null): Promise<void> {
    await prisma.crmLead.update({ where: { id }, data: { stage, lostReason } });
  }
  async convertToQuote(id: string, input: { quoteNumber: string; companyId: string; text: string }): Promise<{ quoteId: string }> {
    return prisma.$transaction(async (tx) => {
      // Atomarer Gate: nur eine offene Vor-Angebot-Stufe konvertieren (Doppelklick-sicher).
      const gate = await tx.crmLead.updateMany({
        where: { id, stage: { in: ["NEU", "KONTAKTIERT", "QUALIFIZIERT"] } },
        data: { stage: "ANGEBOT" },
      });
      if (gate.count === 0) throw new Error(`CRM-Eintrag ${id} ist bereits überführt oder nicht überführbar`);
      const quote = await tx.quote.create({ data: { number: input.quoteNumber, companyId: input.companyId, status: "ENTWURF" }, select: { id: true } });
      const text = input.text.trim();
      if (text.length > 0) {
        await tx.quoteLine.create({ data: { quoteId: quote.id, position: 1, description: text, qty: 1, unitNetCents: 0, taxRatePct: 19, kind: "TEXTIL" } });
      }
      await tx.crmLead.update({ where: { id }, data: { quoteId: quote.id } });
      return { quoteId: quote.id };
    });
  }
}
