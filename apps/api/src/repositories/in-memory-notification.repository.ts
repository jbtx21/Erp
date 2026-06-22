// In-Memory-Implementierung der Benachrichtigungen + Vorlagen (Tests/Dev).

import type {
  EmailTemplateItem,
  EmailTemplateRepository,
  NotificationItem,
  NotificationRepository,
} from "../modules/notification/notification.service.js";

export class InMemoryNotificationRepository implements NotificationRepository {
  private items: NotificationItem[] = [];
  private seq = 0;
  async create(i: { recipient: string; title: string; body: string | null; navKey: string | null }): Promise<NotificationItem> {
    const n: NotificationItem = { id: `ntf_${String(++this.seq)}`, read: false, createdAt: new Date(), ...i };
    this.items.unshift(n);
    return n;
  }
  async listFor(recipient: string, limit: number): Promise<NotificationItem[]> {
    return this.items.filter((n) => n.recipient === recipient).slice(0, limit);
  }
  async unreadCount(recipient: string): Promise<number> {
    return this.items.filter((n) => n.recipient === recipient && !n.read).length;
  }
  async markRead(id: string): Promise<void> {
    const n = this.items.find((x) => x.id === id);
    if (n) n.read = true;
  }
  async markAllRead(recipient: string): Promise<void> {
    for (const n of this.items) if (n.recipient === recipient) n.read = true;
  }
}

export class InMemoryEmailTemplateRepository implements EmailTemplateRepository {
  private items = new Map<string, EmailTemplateItem>();
  private seq = 0;
  async list(): Promise<EmailTemplateItem[]> {
    return [...this.items.values()];
  }
  async get(key: string): Promise<EmailTemplateItem | null> {
    return this.items.get(key) ?? null;
  }
  async upsert(key: string, subject: string, body: string): Promise<EmailTemplateItem> {
    const existing = this.items.get(key);
    const item: EmailTemplateItem = { id: existing?.id ?? `tpl_${String(++this.seq)}`, key, subject, body, updatedAt: new Date() };
    this.items.set(key, item);
    return item;
  }
}
