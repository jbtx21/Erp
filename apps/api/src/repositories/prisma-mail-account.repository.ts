// Prisma-Implementierung der Mailkonten-Verwaltung (Multi-Mailkonten).

import { prisma } from "@texma/db";
import type { MailAccountRecord, MailAccountRepository } from "../modules/mail/mail-account.service.js";

export class PrismaMailAccountRepository implements MailAccountRepository {
  async list(): Promise<MailAccountRecord[]> {
    return prisma.mailAccount.findMany({ orderBy: { createdAt: "asc" } });
  }

  async get(id: string): Promise<MailAccountRecord | null> {
    return prisma.mailAccount.findUnique({ where: { id } });
  }

  async create(data: Omit<MailAccountRecord, "id">): Promise<MailAccountRecord> {
    return prisma.mailAccount.create({ data });
  }

  async update(id: string, data: Partial<Omit<MailAccountRecord, "id">>): Promise<MailAccountRecord> {
    return prisma.mailAccount.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await prisma.mailAccount.delete({ where: { id } });
  }

  async clearDefault(kind: "incoming" | "outgoing"): Promise<void> {
    await prisma.mailAccount.updateMany({ data: kind === "incoming" ? { defaultIncoming: false } : { defaultOutgoing: false } });
  }

  async defaultOutgoing(): Promise<MailAccountRecord | null> {
    return prisma.mailAccount.findFirst({ where: { defaultOutgoing: true } });
  }
}
