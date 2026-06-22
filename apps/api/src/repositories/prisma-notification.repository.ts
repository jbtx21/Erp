// Prisma-Implementierung der Benachrichtigungen + E-Mail-Vorlagen (G-5).

import { prisma } from "@texma/db";
import type {
  EmailTemplateItem,
  EmailTemplateRepository,
  NotificationItem,
  NotificationRepository,
} from "../modules/notification/notification.service.js";

export class PrismaNotificationRepository implements NotificationRepository {
  async create(i: { recipient: string; title: string; body: string | null; navKey: string | null }): Promise<NotificationItem> {
    return prisma.notification.create({ data: i });
  }
  async listFor(recipient: string, limit: number): Promise<NotificationItem[]> {
    return prisma.notification.findMany({ where: { recipient }, orderBy: { createdAt: "desc" }, take: limit });
  }
  async unreadCount(recipient: string): Promise<number> {
    return prisma.notification.count({ where: { recipient, read: false } });
  }
  async markRead(id: string): Promise<void> {
    await prisma.notification.update({ where: { id }, data: { read: true } });
  }
  async markAllRead(recipient: string): Promise<void> {
    await prisma.notification.updateMany({ where: { recipient, read: false }, data: { read: true } });
  }
}

export class PrismaEmailTemplateRepository implements EmailTemplateRepository {
  async list(): Promise<EmailTemplateItem[]> {
    return prisma.emailTemplate.findMany({ orderBy: { key: "asc" } });
  }
  async get(key: string): Promise<EmailTemplateItem | null> {
    return prisma.emailTemplate.findUnique({ where: { key } });
  }
  async upsert(key: string, subject: string, body: string): Promise<EmailTemplateItem> {
    return prisma.emailTemplate.upsert({ where: { key }, update: { subject, body }, create: { key, subject, body } });
  }
}
