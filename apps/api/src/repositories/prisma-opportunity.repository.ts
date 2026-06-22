// Prisma-Verkaufschancen.

import { prisma } from "@texma/db";
import type { OpportunityStage, OpportunityStatus } from "@texma/shared";
import type { OpportunityRepository, OpportunityRow } from "../modules/opportunity/opportunity.service.js";

function toRow(o: { id: string; title: string; companyId: string | null; stage: string; valueCents: number; probability: number; status: string; lostReason: string | null }): OpportunityRow {
  return { id: o.id, title: o.title, companyId: o.companyId, stage: o.stage as OpportunityStage, valueCents: o.valueCents, probability: o.probability, status: o.status as OpportunityStatus, lostReason: o.lostReason };
}

export class PrismaOpportunityRepository implements OpportunityRepository {
  async list(): Promise<OpportunityRow[]> {
    const rows = await prisma.opportunity.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toRow);
  }
  async create(input: { title: string; companyId: string | null; stage: OpportunityStage; valueCents: number; probability: number }): Promise<{ id: string }> {
    return prisma.opportunity.create({
      data: { title: input.title, companyId: input.companyId, stage: input.stage as never, valueCents: input.valueCents, probability: input.probability },
      select: { id: true },
    });
  }
  async get(id: string): Promise<OpportunityRow | null> {
    const o = await prisma.opportunity.findUnique({ where: { id } });
    return o ? toRow(o) : null;
  }
  async update(id: string, patch: Partial<{ stage: OpportunityStage; probability: number; valueCents: number; status: OpportunityStatus; lostReason: string | null }>): Promise<void> {
    await prisma.opportunity.update({ where: { id }, data: patch as never });
  }
}
