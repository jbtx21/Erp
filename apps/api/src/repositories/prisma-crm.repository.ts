import { prisma, Prisma } from "@texma/db";
import type { CrmStage } from "@texma/shared";
import type { CreateCrmLeadInput, CrmLeadRecord, CrmLine, CrmRepository, UpdateCrmLeadInput } from "../modules/crm/crm.service.js";

const VIEW = {
  id: true, name: true, companyId: true, contactName: true, email: true, phone: true,
  source: true, stage: true, valueCents: true, probability: true, expectedCloseAt: true,
  text: true, note: true, lostReason: true, quoteId: true, lines: true, createdAt: true,
  company: { select: { name: true } },
} as const;

type ViewRow = {
  id: string; name: string; companyId: string | null; contactName: string | null; email: string | null;
  phone: string | null; source: CrmLeadRecord["source"]; stage: CrmStage; valueCents: number | null;
  probability: number | null; expectedCloseAt: Date | null; text: string | null; note: string | null;
  lostReason: string | null; quoteId: string | null; lines: unknown; createdAt: Date; company: { name: string } | null;
};

// Firma-Relation flach in companyName auflösen (Liste zeigt den Namen, nicht die cuid).
function toRecord(r: ViewRow): CrmLeadRecord {
  const { company, lines, ...rest } = r;
  return { ...rest, companyName: company?.name ?? null, lines: Array.isArray(lines) ? (lines as CrmLine[]) : null };
}

export class PrismaCrmRepository implements CrmRepository {
  async list(): Promise<CrmLeadRecord[]> {
    const rows = (await prisma.crmLead.findMany({ orderBy: { createdAt: "desc" }, select: VIEW })) as ViewRow[];
    return rows.map(toRecord);
  }
  async load(id: string): Promise<CrmLeadRecord | null> {
    const r = (await prisma.crmLead.findUnique({ where: { id }, select: VIEW })) as ViewRow | null;
    return r ? toRecord(r) : null;
  }
  async create(input: CreateCrmLeadInput & { stage: CrmStage }): Promise<CrmLeadRecord> {
    const r = (await prisma.crmLead.create({
      data: {
        name: input.name, companyId: input.companyId ?? null, contactName: input.contactName ?? null,
        email: input.email ?? null, phone: input.phone ?? null, source: input.source ?? null,
        valueCents: input.valueCents ?? null, expectedCloseAt: input.expectedCloseAt ?? null,
        text: input.text ?? null, note: input.note ?? null, stage: input.stage,
      },
      select: VIEW,
    })) as ViewRow;
    return toRecord(r);
  }
  async update(id: string, patch: UpdateCrmLeadInput): Promise<CrmLeadRecord> {
    const r = (await prisma.crmLead.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.companyId !== undefined ? { companyId: patch.companyId } : {}),
        ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.valueCents !== undefined ? { valueCents: patch.valueCents } : {}),
        ...(patch.expectedCloseAt !== undefined ? { expectedCloseAt: patch.expectedCloseAt } : {}),
        ...(patch.text !== undefined ? { text: patch.text } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.lines !== undefined ? { lines: patch.lines === null ? Prisma.DbNull : (patch.lines as unknown as Prisma.InputJsonValue) } : {}),
      },
      select: VIEW,
    })) as ViewRow;
    return toRecord(r);
  }
  async setStage(id: string, stage: CrmStage, lostReason: string | null): Promise<void> {
    await prisma.crmLead.update({ where: { id }, data: { stage, lostReason } });
  }
  async convertToQuote(id: string, input: { quoteNumber: string; companyId: string; text: string; lines: CrmLine[] | null }): Promise<{ quoteId: string }> {
    return prisma.$transaction(async (tx) => {
      // Atomarer Gate: nur eine offene Vor-Angebot-Stufe konvertieren (Doppelklick-sicher).
      const gate = await tx.crmLead.updateMany({
        where: { id, stage: { in: ["NEU", "KONTAKTIERT", "QUALIFIZIERT"] } },
        data: { stage: "ANGEBOT" },
      });
      if (gate.count === 0) throw new Error(`CRM-Eintrag ${id} ist bereits überführt oder nicht überführbar`);
      const quote = await tx.quote.create({ data: { number: input.quoteNumber, companyId: input.companyId, status: "ENTWURF" }, select: { id: true } });
      // Erfasste Anfrage-Positionen → echte QuoteLines (Freitext bleibt erhalten, Variante optional).
      // Ohne Positionen Fallback auf eine Freitext-Zeile aus Bedarf/Bezeichnung.
      const lines = (input.lines ?? []).filter((l) => l.description.trim().length > 0 && l.qty > 0);
      if (lines.length > 0) {
        await tx.quoteLine.createMany({ data: lines.map((l, i) => ({
          quoteId: quote.id, position: i + 1, description: l.description.trim(), qty: l.qty,
          unitNetCents: l.unitNetCents, taxRatePct: l.taxRatePct ?? 19, kind: l.kind,
          variantId: l.variantId ?? null, bezugPosition: l.bezugPosition ?? null,
          lineType: l.lineType ?? "ARTIKEL", placement: l.placement ?? null, altPreisText: l.altPreisText ?? null, imPdfAusblenden: l.imPdfAusblenden ?? false,
        })) });
      } else {
        const text = input.text.trim();
        if (text.length > 0) {
          await tx.quoteLine.create({ data: { quoteId: quote.id, position: 1, description: text, qty: 1, unitNetCents: 0, taxRatePct: 19, kind: "TEXTIL" } });
        }
      }
      await tx.crmLead.update({ where: { id }, data: { quoteId: quote.id } });
      return { quoteId: quote.id };
    });
  }
}
