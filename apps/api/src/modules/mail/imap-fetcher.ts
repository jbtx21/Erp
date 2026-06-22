// IMAP-Eingangs-Adapter. Ohne konfigurierte Zugangsdaten (IMAP_HOST/USER/PASS) ein
// No-Op (liefert keine Mails) — so läuft der Server ohne Postfach. Der echte IMAP-
// Client (imapflow) wird als Worker-Adapter ergänzt; die Verarbeitungslogik
// (MailIntakeService) ist davon entkoppelt und voll getestet.

import type { IncomingMail } from "@texma/shared";
import type { MailFetcher } from "./mail.service.js";

export class ImapMailFetcher implements MailFetcher {
  private readonly configured: boolean;
  constructor() {
    this.configured = Boolean(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS);
  }
  async fetchUnseen(): Promise<IncomingMail[]> {
    if (!this.configured) return []; // kein Postfach konfiguriert → nichts zu tun
    // TODO Worker-Adapter: imapflow-Verbindung, UNSEEN holen, mailparser → IncomingMail.
    return [];
  }
  async markProcessed(_messageId: string): Promise<void> {
    // TODO: per IMAP \Seen markieren (Worker-Adapter).
  }
}
