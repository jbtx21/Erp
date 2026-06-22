// Newsletter: Kampagnen anlegen und an die Opt-in-Kontakte versenden. Empfängerliste
// wird zum Versandzeitpunkt rein aus den Kontakten gebildet (@texma/shared buildAudience,
// DSGVO). Der eigentliche Versand läuft über einen Provider-Port (Brevo o. Stub).

import { buildAudience, type NewsletterContact, type NewsletterRecipient } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface CampaignRow {
  id: string;
  subject: string;
  body: string;
  status: "ENTWURF" | "GESENDET";
  recipientCount: number;
  sentAt: Date | null;
}

export interface NewsletterRepository {
  listCampaigns(): Promise<CampaignRow[]>;
  createCampaign(subject: string, body: string): Promise<{ id: string }>;
  getCampaign(id: string): Promise<CampaignRow | null>;
  markSent(id: string, recipientCount: number, providerRef: string | null): Promise<void>;
  audienceContacts(): Promise<NewsletterContact[]>;
}

/** Versand-Provider (Brevo o. Stub). */
export interface NewsletterProvider {
  send(input: { subject: string; body: string; recipients: NewsletterRecipient[] }): Promise<{ providerRef: string | null }>;
}

export class NewsletterError extends Error {}

export class NewsletterService {
  constructor(
    private readonly repo: NewsletterRepository,
    private readonly provider: NewsletterProvider,
    private readonly audit: AuditSink
  ) {}

  listCampaigns(): Promise<CampaignRow[]> { return this.repo.listCampaigns(); }

  /** Vorschau der aktuellen Empfängerzahl (für die UI). */
  async audienceSize(): Promise<number> {
    return buildAudience(await this.repo.audienceContacts()).length;
  }

  async createCampaign(subject: string, body: string): Promise<{ id: string }> {
    if (!subject.trim()) throw new NewsletterError("Betreff ist Pflicht.");
    if (!body.trim()) throw new NewsletterError("Inhalt ist Pflicht.");
    return this.repo.createCampaign(subject.trim(), body.trim());
  }

  async send(campaignId: string): Promise<{ recipientCount: number }> {
    const c = await this.repo.getCampaign(campaignId);
    if (!c) throw new NewsletterError("Kampagne nicht gefunden.");
    if (c.status === "GESENDET") throw new NewsletterError("Kampagne wurde bereits versendet.");
    const recipients = buildAudience(await this.repo.audienceContacts());
    if (recipients.length === 0) throw new NewsletterError("Keine Empfänger mit Opt-in vorhanden.");
    const { providerRef } = await this.provider.send({ subject: c.subject, body: c.body, recipients });
    await this.repo.markSent(campaignId, recipients.length, providerRef);
    await this.audit.append(buildEntry({ entity: "NewsletterCampaign", entityId: campaignId, action: "UPDATE", after: { status: "GESENDET", recipientCount: recipients.length, providerRef } }));
    return { recipientCount: recipients.length };
  }
}

/** Stub-Provider: protokolliert statt zu versenden (kein Brevo-Zugang konfiguriert). */
export class StubNewsletterProvider implements NewsletterProvider {
  public readonly sent: { subject: string; count: number }[] = [];
  async send(input: { subject: string; body: string; recipients: NewsletterRecipient[] }): Promise<{ providerRef: string | null }> {
    this.sent.push({ subject: input.subject, count: input.recipients.length });
    // eslint-disable-next-line no-console
    console.log(`[Newsletter/STUB] "${input.subject}" an ${input.recipients.length} Empfänger`);
    return { providerRef: null };
  }
}
