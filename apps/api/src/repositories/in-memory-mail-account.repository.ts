// In-Memory-Mailkonten für Unit-Tests/Dev.

import type { MailAccountRecord, MailAccountRepository } from "../modules/mail/mail-account.service.js";

export class InMemoryMailAccountRepository implements MailAccountRepository {
  private readonly accounts = new Map<string, MailAccountRecord>();
  private seq = 0;

  async list(): Promise<MailAccountRecord[]> {
    return [...this.accounts.values()].map((a) => ({ ...a }));
  }

  async get(id: string): Promise<MailAccountRecord | null> {
    const a = this.accounts.get(id);
    return a ? { ...a } : null;
  }

  async create(data: Omit<MailAccountRecord, "id">): Promise<MailAccountRecord> {
    const id = `mail_${++this.seq}`;
    const rec: MailAccountRecord = { id, ...data };
    this.accounts.set(id, rec);
    return { ...rec };
  }

  async update(id: string, data: Partial<Omit<MailAccountRecord, "id">>): Promise<MailAccountRecord> {
    const a = this.accounts.get(id);
    if (!a) throw new Error(`Konto ${id} nicht gefunden.`);
    const next = { ...a, ...data };
    this.accounts.set(id, next);
    return { ...next };
  }

  async remove(id: string): Promise<void> {
    this.accounts.delete(id);
  }

  async clearDefault(kind: "incoming" | "outgoing"): Promise<void> {
    for (const a of this.accounts.values()) {
      if (kind === "incoming") a.defaultIncoming = false;
      else a.defaultOutgoing = false;
    }
  }

  async defaultOutgoing(): Promise<MailAccountRecord | null> {
    const a = [...this.accounts.values()].find((x) => x.defaultOutgoing);
    return a ? { ...a } : null;
  }
}
