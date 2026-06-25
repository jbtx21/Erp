import { prisma } from "@texma/db";
import type { GutscheinRecord, GutscheinRepository } from "../modules/gutschein/gutschein.service.js";

export class PrismaGutscheinRepository implements GutscheinRepository {
  async list(): Promise<GutscheinRecord[]> {
    return prisma.gutschein.findMany({ orderBy: { createdAt: "desc" } });
  }
  async findByCode(code: string): Promise<GutscheinRecord | null> {
    return prisma.gutschein.findUnique({ where: { code } });
  }
  async create(input: { code: string; initialCents: number; validUntil: Date | null; note: string | null }): Promise<GutscheinRecord> {
    return prisma.gutschein.create({
      data: { code: input.code, initialCents: input.initialCents, remainingCents: input.initialCents, validUntil: input.validUntil, note: input.note },
    });
  }
  async setRemaining(id: string, remainingCents: number): Promise<void> {
    await prisma.gutschein.update({ where: { id }, data: { remainingCents } });
  }
}
