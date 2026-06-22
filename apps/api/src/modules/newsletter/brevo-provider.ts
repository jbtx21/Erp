// Brevo-Versand-Adapter (transactional email, API v3). Aktiv nur mit BREVO_API_KEY;
// ohne Schlüssel meldet er einen klaren Fehler (der Stub-Provider wird dann verwendet).
// Netzwerk-Adapter — in dieser Umgebung nicht live testbar; injizierbares fetch.

import type { NewsletterRecipient } from "@texma/shared";
import type { NewsletterProvider } from "./newsletter.service.js";

type FetchLike = typeof globalThis.fetch;

export class BrevoNewsletterProvider implements NewsletterProvider {
  constructor(
    private readonly apiKey: string,
    private readonly sender: { name: string; email: string },
    private readonly fetchImpl: FetchLike = globalThis.fetch
  ) {}

  async send(input: { subject: string; body: string; recipients: NewsletterRecipient[] }): Promise<{ providerRef: string | null }> {
    if (!this.apiKey) throw new Error("BREVO_API_KEY fehlt.");
    // Brevo: ein Transaktions-Mailing mit mehreren Empfängern (messageVersions wäre
    // pro-Empfänger-Personalisierung; hier ein gemeinsamer Inhalt).
    const res = await this.fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: this.sender,
        subject: input.subject,
        htmlContent: `<html><body>${input.body}</body></html>`,
        messageVersions: input.recipients.map((r) => ({ to: [{ email: r.email, name: r.name }] })),
      }),
    });
    if (!res.ok) throw new Error(`Brevo-Fehler ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { messageId?: string; messageIds?: string[] };
    return { providerRef: json.messageId ?? json.messageIds?.[0] ?? null };
  }
}
