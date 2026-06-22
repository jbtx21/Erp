// In-Memory-Maileingang für Tests: konfigurierbare Postfach-Mails + Anfrage-Anlage.

import type { CompanyEmailRef, IncomingMail } from "@texma/shared";
import type { MailFetcher, MailIntakeRepository } from "../modules/mail/mail.service.js";

export class InMemoryMailFetcher implements MailFetcher {
  public processed: string[] = [];
  constructor(private mails: IncomingMail[] = []) {}
  setMails(m: IncomingMail[]): void { this.mails = m; }
  async fetchUnseen(): Promise<IncomingMail[]> { return this.mails.filter((m) => !this.processed.includes(m.messageId)); }
  async markProcessed(messageId: string): Promise<void> { this.processed.push(messageId); }
}

export class InMemoryMailIntakeRepository implements MailIntakeRepository {
  public created: { id: string; companyId: string | null; externalRef: string }[] = [];
  private seq = 0;
  constructor(private refs: CompanyEmailRef[] = []) {}
  async companyEmailRefs(): Promise<CompanyEmailRef[]> { return this.refs; }
  async inquiryExists(externalRef: string): Promise<boolean> { return this.created.some((c) => c.externalRef === externalRef); }
  async createInquiry(input: { number: string; text: string; companyId: string | null; kontaktName: string | null; externalRef: string }): Promise<{ id: string }> {
    const id = `inq_${String(++this.seq)}`;
    this.created.push({ id, companyId: input.companyId, externalRef: input.externalRef });
    return { id };
  }
}
