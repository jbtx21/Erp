// Mitarbeiter-Nachrichtenportal: interne Nachrichten zwischen Mitarbeitern (Posteingang/
// Postausgang, gelesen/ungelesen). Kein E-Mail-Versand — rein internes Postfach.

import { buildEntry, type AuditSink } from "@texma/audit";

export interface MessageRow {
  id: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

export interface MessageRepository {
  inbox(email: string): Promise<MessageRow[]>;
  sent(email: string): Promise<MessageRow[]>;
  unreadCount(email: string): Promise<number>;
  create(input: { fromEmail: string; toEmail: string; subject: string; body: string }): Promise<{ id: string }>;
  markRead(id: string, email: string): Promise<boolean>;
}

export class MessageError extends Error {}

export class MessageService {
  constructor(private readonly repo: MessageRepository, private readonly audit: AuditSink) {}

  inbox(email: string): Promise<MessageRow[]> { return this.repo.inbox(email); }
  sent(email: string): Promise<MessageRow[]> { return this.repo.sent(email); }
  unreadCount(email: string): Promise<number> { return this.repo.unreadCount(email); }

  async send(fromEmail: string, toEmail: string, subject: string, body: string): Promise<{ id: string }> {
    if (!toEmail.trim()) throw new MessageError("Empfänger ist Pflicht.");
    if (!subject.trim()) throw new MessageError("Betreff ist Pflicht.");
    if (toEmail.trim().toLowerCase() === fromEmail.toLowerCase()) throw new MessageError("Nachricht an sich selbst ist nicht möglich.");
    const res = await this.repo.create({ fromEmail, toEmail: toEmail.trim().toLowerCase(), subject: subject.trim(), body });
    await this.audit.append(buildEntry({ entity: "InternalMessage", entityId: res.id, action: "CREATE", after: { fromEmail, toEmail } }));
    return res;
  }

  async markRead(id: string, email: string): Promise<void> {
    const ok = await this.repo.markRead(id, email);
    if (!ok) throw new MessageError("Nachricht nicht gefunden oder keine Berechtigung.");
  }
}
