// Slack-Incoming-Webhook-Sender. Netzwerk-Adapter (injizierbares fetch), in dieser
// Umgebung nicht live testbar — die Service-Logik nutzt im Test den LoggingSlackSender.

import type { SlackSender } from "./integrations.service.js";

type FetchLike = typeof globalThis.fetch;

export class HttpSlackSender implements SlackSender {
  constructor(private readonly fetchImpl: FetchLike = globalThis.fetch) {}
  async send(webhookUrl: string, text: string): Promise<void> {
    const res = await this.fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Slack-Webhook-Fehler ${res.status}`);
  }
}
