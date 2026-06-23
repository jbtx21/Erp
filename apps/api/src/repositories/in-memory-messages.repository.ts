// In-Memory-Nachrichtenportal für Tests.

import type { MessageRepository, MessageRow } from "../modules/messages/messages.service.js";

export class InMemoryMessageRepository implements MessageRepository {
  public items: MessageRow[] = [];
  private seq = 0;
  async inbox(email: string): Promise<MessageRow[]> {
    return this.items.filter((m) => m.toEmail === email).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async sent(email: string): Promise<MessageRow[]> {
    return this.items.filter((m) => m.fromEmail === email).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async unreadCount(email: string): Promise<number> {
    return this.items.filter((m) => m.toEmail === email && !m.read).length;
  }
  async create(input: { fromEmail: string; toEmail: string; subject: string; body: string }): Promise<{ id: string }> {
    const id = `msg_${String(++this.seq)}`;
    this.items.push({ id, ...input, read: false, createdAt: new Date() });
    return { id };
  }
  async markRead(id: string, email: string): Promise<boolean> {
    const m = this.items.find((x) => x.id === id && x.toEmail === email);
    if (!m) return false;
    m.read = true;
    return true;
  }
}
