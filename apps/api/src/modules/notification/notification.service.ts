// Benachrichtigungen + E-Mail-/Text-Vorlagen (ERP-Grundfunktion / G-5).
// In-App-Benachrichtigungen je Empfänger; Vorlagen mit {{platzhalter}}-Rendering
// (renderTemplate aus @texma/shared). Versand selbst (SMTP) ist ein Integrationspunkt.

import { renderTemplate } from "@texma/shared";

// ── In-App-Benachrichtigungen ───────────────────────────────────────────────
export interface NotificationItem {
  id: string;
  recipient: string;
  title: string;
  body: string | null;
  navKey: string | null;
  read: boolean;
  createdAt: Date;
}

export interface NotificationRepository {
  create(input: { recipient: string; title: string; body: string | null; navKey: string | null }): Promise<NotificationItem>;
  listFor(recipient: string, limit: number): Promise<NotificationItem[]>;
  unreadCount(recipient: string): Promise<number>;
  markRead(id: string): Promise<void>;
  markAllRead(recipient: string): Promise<void>;
}

export class NotificationService {
  constructor(private readonly repo: NotificationRepository) {}

  notify(recipient: string, title: string, body: string | null = null, navKey: string | null = null): Promise<NotificationItem> {
    return this.repo.create({ recipient, title, body, navKey });
  }
  listFor(recipient: string, limit = 30): Promise<NotificationItem[]> {
    return this.repo.listFor(recipient, limit);
  }
  unreadCount(recipient: string): Promise<number> {
    return this.repo.unreadCount(recipient);
  }
  markRead(id: string): Promise<void> {
    return this.repo.markRead(id);
  }
  markAllRead(recipient: string): Promise<void> {
    return this.repo.markAllRead(recipient);
  }
}

// ── E-Mail-/Text-Vorlagen ───────────────────────────────────────────────────
export interface EmailTemplateItem {
  id: string;
  key: string;
  subject: string;
  body: string;
  updatedAt: Date;
}

export interface EmailTemplateRepository {
  list(): Promise<EmailTemplateItem[]>;
  get(key: string): Promise<EmailTemplateItem | null>;
  upsert(key: string, subject: string, body: string): Promise<EmailTemplateItem>;
}

export class EmailTemplateError extends Error {}

export class EmailTemplateService {
  constructor(private readonly repo: EmailTemplateRepository) {}

  list(): Promise<EmailTemplateItem[]> {
    return this.repo.list();
  }
  async upsert(key: string, subject: string, body: string): Promise<EmailTemplateItem> {
    if (!key.trim() || !subject.trim() || !body.trim()) throw new EmailTemplateError("Schlüssel, Betreff und Text sind Pflicht.");
    return this.repo.upsert(key.trim(), subject, body);
  }
  /** Rendert Betreff + Text einer Vorlage mit Variablen; wirft bei fehlender Vorlage. */
  async render(key: string, vars: Record<string, string | number>): Promise<{ subject: string; body: string }> {
    const tpl = await this.repo.get(key);
    if (!tpl) throw new EmailTemplateError(`Vorlage '${key}' nicht gefunden.`);
    return { subject: renderTemplate(tpl.subject, vars), body: renderTemplate(tpl.body, vars) };
  }
}
