// In-Memory-Newsletter-Repository für Tests.

import type { NewsletterContact } from "@texma/shared";
import type { CampaignRow, NewsletterRepository } from "../modules/newsletter/newsletter.service.js";

export class InMemoryNewsletterRepository implements NewsletterRepository {
  private campaigns: CampaignRow[] = [];
  private seq = 0;
  constructor(private contacts: NewsletterContact[] = []) {}

  setContacts(c: NewsletterContact[]): void { this.contacts = c; }
  async listCampaigns(): Promise<CampaignRow[]> { return this.campaigns; }
  async createCampaign(subject: string, body: string): Promise<{ id: string }> {
    const id = `camp_${String(++this.seq)}`;
    this.campaigns.push({ id, subject, body, status: "ENTWURF", recipientCount: 0, sentAt: null });
    return { id };
  }
  async getCampaign(id: string): Promise<CampaignRow | null> { return this.campaigns.find((c) => c.id === id) ?? null; }
  async markSent(id: string, recipientCount: number, _providerRef: string | null): Promise<void> {
    const c = this.campaigns.find((x) => x.id === id);
    if (c) { c.status = "GESENDET"; c.recipientCount = recipientCount; c.sentAt = new Date(); }
  }
  async audienceContacts(): Promise<NewsletterContact[]> { return this.contacts; }
}
