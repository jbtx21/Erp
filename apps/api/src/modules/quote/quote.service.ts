// Angebot: Verfall + Verlustgrund (B8, Kap. 35.1). Ablehnung erfordert einen
// Pflicht-Verlustgrund und einen erlaubten Statusübergang (F2). Abgelaufene
// Angebote erzeugen eine DueItem-Wiedervorlage (idempotent).

import { assertQuoteRejectable, type QuoteStatus } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface ExpiredQuote {
  id: string;
  gueltigBisAm: Date;
}

export interface QuoteRepository {
  getStatus(quoteId: string): Promise<QuoteStatus | null>;
  reject(quoteId: string, verlustgrund: string): Promise<void>;
  /** Offene, abgelaufene Angebote ohne offene Verfalls-Wiedervorlage. */
  listExpiredWithoutDueItem(now: Date): Promise<ExpiredQuote[]>;
  createExpiryDueItem(quoteId: string, now: Date): Promise<void>;
}

export class QuoteService {
  constructor(
    private readonly repo: QuoteRepository,
    private readonly audit: AuditSink
  ) {}

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
