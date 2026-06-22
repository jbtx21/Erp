// Mailanbindung: Eingang (IMAP) → Anfrage mit Kundenstammdaten-Abgleich, und
// Ausgang (SMTP) als Port. Die Netzwerk-Clients (IMAP/SMTP) sind Worker-Adapter;
// hier die idempotente Verarbeitungslogik + die reine Abbildung (@texma/shared).

import { matchCompanyByEmail, mailToInquiry, type CompanyEmailRef, type IncomingMail } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

// ── Eingang (IMAP) ──────────────────────────────────────────────────────────

/** IMAP-Port: liefert ungelesene Mails und markiert sie als verarbeitet. */
export interface MailFetcher {
  fetchUnseen(): Promise<IncomingMail[]>;
  markProcessed(messageId: string): Promise<void>;
}

export interface MailIntakeRepository {
  /** Kontakt-E-Mails aller Firmen für den Abgleich. */
  companyEmailRefs(): Promise<CompanyEmailRef[]>;
  inquiryExists(externalRef: string): Promise<boolean>;
  createInquiry(input: { number: string; text: string; companyId: string | null; kontaktName: string | null; externalRef: string }): Promise<{ id: string }>;
}

export interface IntakeSummary {
  created: number;
  matched: number;
  skipped: number;
}

export class MailIntakeService {
  constructor(
    private readonly fetcher: MailFetcher,
    private readonly repo: MailIntakeRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  /** Holt ungelesene Mails und wandelt sie idempotent in Anfragen um. */
  async pollInbox(): Promise<IntakeSummary> {
    const refs = await this.repo.companyEmailRefs();
    const mails = await this.fetcher.fetchUnseen();
    const summary: IntakeSummary = { created: 0, matched: 0, skipped: 0 };

    for (const mail of mails) {
      if (await this.repo.inquiryExists(mail.messageId)) { summary.skipped++; await this.fetcher.markProcessed(mail.messageId); continue; }
      const companyId = matchCompanyByEmail(mail.from, refs);
      const draft = mailToInquiry(mail, companyId);
      const number = await this.numbering.next("INQUIRY");
      const { id } = await this.repo.createInquiry({ number, text: draft.text, companyId: draft.companyId, kontaktName: draft.kontaktName, externalRef: draft.externalRef });
      if (companyId) summary.matched++;
      summary.created++;
      await this.fetcher.markProcessed(mail.messageId);
      await this.audit.append(buildEntry({ entity: "Inquiry", entityId: id, action: "CREATE", after: { number, fromMail: mail.messageId, companyId } }));
    }
    return summary;
  }
}

// ── Ausgang (SMTP) ──────────────────────────────────────────────────────────

export interface OutgoingMail {
  to: string;
  subject: string;
  body: string;
}

/** SMTP-Port: konkrete Implementierung (nodemailer o. Ä.) als Worker-Adapter. */
export interface MailSender {
  send(mail: OutgoingMail): Promise<void>;
}

/** Dev-/Test-Sender: protokolliert statt zu versenden (kein echter SMTP-Zugang). */
export class LoggingMailSender implements MailSender {
  public readonly sent: OutgoingMail[] = [];
  async send(mail: OutgoingMail): Promise<void> {
    this.sent.push(mail);
    // eslint-disable-next-line no-console
    console.log(`[Mail/STUB] → ${mail.to}: ${mail.subject}`);
  }
}

export class MailSendService {
  constructor(private readonly sender: MailSender) {}
  send(mail: OutgoingMail): Promise<void> { return this.sender.send(mail); }
}
