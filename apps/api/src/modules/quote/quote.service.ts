// Angebot: Verfall + Verlustgrund (B8, Kap. 35.1). Ablehnung erfordert einen
// Pflicht-Verlustgrund und einen erlaubten Statusübergang (F2). Abgelaufene
// Angebote erzeugen eine DueItem-Wiedervorlage (idempotent).

import { assertQuoteRejectable, quoteStatusMachine, type QuoteStatus } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface ExpiredQuote {
  id: string;
  gueltigBisAm: Date;
}

export interface QuoteRow {
  id: string;
  number: string;
  companyId: string;
  status: QuoteStatus;
  gueltigBisAm: Date | null;
  totalNetCents: number;
}

export interface CreateQuoteInput {
  companyId: string;
  gueltigBisAm?: Date | null;
  lines: Array<{ description: string; qty: number; unitNetCents: number }>;
}

export type QuoteTransition = "VERSENDET" | "NACHFASSEN" | "ANGENOMMEN";

export interface QuoteRepository {
  getStatus(quoteId: string): Promise<QuoteStatus | null>;
  reject(quoteId: string, verlustgrund: string): Promise<void>;
  /** Offene, abgelaufene Angebote ohne offene Verfalls-Wiedervorlage. */
  listExpiredWithoutDueItem(now: Date): Promise<ExpiredQuote[]>;
  createExpiryDueItem(quoteId: string, now: Date): Promise<void>;
  list(): Promise<QuoteRow[]>;
  create(input: CreateQuoteInput & { number: string }): Promise<{ id: string }>;
  setStatus(quoteId: string, status: QuoteStatus): Promise<void>;
}

export class QuoteError extends Error {}

export class QuoteService {
  constructor(
    private readonly repo: QuoteRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  async list(): Promise<QuoteRow[]> {
    return this.repo.list();
  }

  /** Legt ein Angebot als Entwurf an (AN-Nummer aus F1). */
  async create(input: CreateQuoteInput): Promise<{ id: string; number: string }> {
    if (!input.companyId) throw new QuoteError("Firma ist Pflicht.");
    if (!input.lines || input.lines.length === 0) throw new QuoteError("Mindestens eine Position.");
    const number = await this.numbering.next("QUOTE");
    const { id } = await this.repo.create({ ...input, number });
    await this.audit.append(buildEntry({ entity: "Quote", entityId: id, action: "CREATE", after: { number, companyId: input.companyId } }));
    return { id, number };
  }

  /** Status weiterschalten (F2; ABGELEHNT läuft über reject mit Grund). */
  async transition(quoteId: string, to: QuoteTransition): Promise<void> {
    const status = await this.repo.getStatus(quoteId);
    if (!status) throw new QuoteError(`Angebot ${quoteId} nicht gefunden`);
    quoteStatusMachine.assert(status, to);
    await this.repo.setStatus(quoteId, to);
    await this.audit.append(buildEntry({ entity: "Quote", entityId: quoteId, action: "UPDATE", after: { status: to } }));
  }

  /** Lehnt ein Angebot mit Pflicht-Verlustgrund ab (F2-Übergang erzwungen). */
  async reject(quoteId: string, verlustgrund: string): Promise<void> {
    const status = await this.repo.getStatus(quoteId);
    if (!status) throw new Error(`Quote ${quoteId} nicht gefunden`);
    assertQuoteRejectable(status, verlustgrund); // wirft bei unerlaubtem Übergang/fehlendem Grund
    await this.repo.reject(quoteId, verlustgrund.trim());
    await this.audit.append(
      buildEntry({
        entity: "Quote",
        entityId: quoteId,
        action: "UPDATE",
        before: { status },
        after: { status: "ABGELEHNT", verlustgrund: verlustgrund.trim() },
      })
    );
  }

  /** Legt für abgelaufene Angebote eine Wiedervorlage an (Verfall, idempotent). */
  async expireOverdue(now: Date = new Date()): Promise<string[]> {
    const expired = await this.repo.listExpiredWithoutDueItem(now);
    for (const q of expired) {
      await this.repo.createExpiryDueItem(q.id, now);
      await this.audit.append(
        buildEntry({ entity: "Quote", entityId: q.id, action: "UPDATE", after: { verfall: q.gueltigBisAm } })
      );
    }
    return expired.map((q) => q.id);
  }
}
