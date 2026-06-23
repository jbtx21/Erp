// Prisma-Nachrichtenportal.

import { prisma } from "@texma/db";
import type { MessageRepository, MessageRow } from "../modules/messages/messages.service.js";

export class PrismaMessageRepository implements MessageRepository {
  async inbox(email: string): Promise<MessageRow[]> {
    return prisma.internalMessage.findMany({ where: { toEmail: email }, orderBy: { createdAt: "desc" } });
  }
  async sent(email: string): Promise<MessageRow[]> {
    return prisma.internalMessage.findMany({ where: { fromEmail: email }, orderBy: { createdAt: "desc" } });
  }
  async unreadCount(email: string): Promise<number> {
    return prisma.internalMessage.count({ where: { toEmail: email, read: false } });
  }
  async create(input: { fromEmail: string; toEmail: string; subject: string; body: string }): Promise<{ id: string }> {
    return prisma.internalMessage.create({ data: input, select: { id: true } });
  }
  async markRead(id: string, email: string): Promise<boolean> {
    const res = await prisma.internalMessage.updateMany({ where: { id, toEmail: email }, data: { read: true } });
    return res.count > 0;
  }
}
