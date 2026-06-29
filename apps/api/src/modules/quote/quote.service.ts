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
  companyName: string;
  status: QuoteStatus;
  orderType: string;
  quotationTo: string;
  gueltigBisAm: Date | null;
  createdAt: Date;
  totalNetCents: number;
  totalTaxCents: number; // USt-Summe (je Satz aggregiert)
  totalGrossCents: number; // Bruttosumme (Netto + USt)
  totalDbCents: number | null; // Summe Deckungsbeitrag (null, wenn keine Position EK hat)
  converted: boolean; // true, sobald ein Auftrag aus dem Angebot erzeugt wurde (QA #16)
}

export interface CreateQuoteInput {
  companyId: string;
  gueltigBisAm?: Date | null;
  orderType?: string;
  quotationTo?: string;
  terms?: string | null;
  zahlungszielTage?: number | null;
  incoterm?: string | null;
  versandregel?: string | null;
  lines: Array<{ description: string; qty: number; unitNetCents: number; listNetCents?: number | null; rabattPct?: number | null; taxRatePct?: number | null; kind?: import("@texma/shared").PositionKind; articleId?: string | null; variantId?: string | null; isAlternative?: boolean; dbCents?: number | null; bezugPosition?: number | null; lineType?: import("@texma/shared").LineType; placement?: string | null; motiv?: string | null; motivGroesse?: string | null; farbton?: string | null; platzierungsdetails?: string | null; sonstiges?: string | null; altPreisText?: string | null; imPdfAusblenden?: boolean }>;
}

export type QuoteTransition = "VERSENDET" | "NACHFASSEN" | "ANGENOMMEN";

/** Angebotsposition für die Bearbeitung (rekonstruiert die Erfassungsmaske). */
export interface QuoteEditLine {
  description: string;
  qty: number;
  kind: import("@texma/shared").PositionKind;
  unitNetCents: number;
  listNetCents: number | null;
  rabattPct: number | null;
  taxRatePct: number;
  dbCents: number | null;
  articleId: string | null;
  variantId: string | null;
  isAlternative: boolean;
  bezugPosition: number | null;
  lineType: import("@texma/shared").LineType;
  placement: string | null;
  motiv: string | null;
  motivGroesse: string | null;
  farbton: string | null;
  platzierungsdetails: string | null;
  sonstiges: string | null;
  altPreisText: string | null;
  imPdfAusblenden: boolean;
}

export interface QuoteEditData {
  id: string;
  companyId: string;
  status: QuoteStatus;
  gueltigBisAm: Date | null;
  terms: string | null;
  orderType: string;
  quotationTo: string;
  zahlungszielTage: number | null;
  incoterm: string | null;
  versandregel: string | null;
  lines: QuoteEditLine[];
}

export interface QuoteRepository {
  getStatus(quoteId: string): Promise<QuoteStatus | null>;
  reject(quoteId: string, verlustgrund: string): Promise<void>;
  /** Offene, abgelaufene Angebote ohne offene Verfalls-Wiedervorlage. */
  listExpiredWithoutDueItem(now: Date): Promise<ExpiredQuote[]>;
  createExpiryDueItem(quoteId: string, now: Date): Promise<void>;
  list(): Promise<QuoteRow[]>;
  create(input: CreateQuoteInput & { number: string }): Promise<{ id: string }>;
  setStatus(quoteId: string, status: QuoteStatus): Promise<void>;
  /**
   * Hebt eine verknüpfte, noch offene CRM-Verkaufschance auf GEWONNEN, sobald das Angebot
   * angenommen wird — hält die Vertriebs-Pipeline (Lead-Phasen) mit der Angebots-Erfolgsquote
   * konsistent (sonst „GEWONNEN 0" trotz angenommener Angebote). Optional (Repos ohne CRM).
   */
  markLinkedLeadWon?(quoteId: string): Promise<void>;
  /** Angebot mit Positionen für die Bearbeitung laden. */
  forEdit(quoteId: string): Promise<QuoteEditData | null>;
  /** Kopf + Positionen ersetzen (vollständige Bearbeitung). */
  update(quoteId: string, input: CreateQuoteInput): Promise<void>;
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

  /** Angebot für die Bearbeitung laden (Kopf + Positionen). */
  async getForEdit(quoteId: string): Promise<QuoteEditData> {
    const data = await this.repo.forEdit(quoteId);
    if (!data) throw new QuoteError(`Angebot ${quoteId} nicht gefunden.`);
    return data;
  }

  /**
   * Vollständige Bearbeitung eines Angebots (Kopf + Positionen), solange es nicht in einen
   * Auftrag gewandelt wurde (Status ANGENOMMEN). Ersetzt die Positionen.
   */
  async update(quoteId: string, input: CreateQuoteInput): Promise<void> {
    const status = await this.repo.getStatus(quoteId);
    if (!status) throw new QuoteError(`Angebot ${quoteId} nicht gefunden.`);
    if (status === "ANGENOMMEN") throw new QuoteError("Angebot wurde bereits in einen Auftrag gewandelt — nicht mehr bearbeitbar.");
    if (!input.companyId) throw new QuoteError("Firma ist Pflicht.");
    if (!input.lines || input.lines.length === 0) throw new QuoteError("Mindestens eine Position.");
    await this.repo.update(quoteId, input);
    await this.audit.append(buildEntry({ entity: "Quote", entityId: quoteId, action: "UPDATE", after: { lineCount: input.lines.length, companyId: input.companyId } }));
  }

  /** Status weiterschalten (F2; ABGELEHNT läuft über reject mit Grund). */
  async transition(quoteId: string, to: QuoteTransition): Promise<void> {
    const status = await this.repo.getStatus(quoteId);
    if (!status) throw new QuoteError(`Angebot ${quoteId} nicht gefunden`);
    quoteStatusMachine.assert(status, to);
    // 0-€-/Leer-Schutz: ein Angebot ohne werthaltige Position darf nicht versendet oder
    // angenommen werden (sonst entstünde später eine 0-€-Rechnung). Alternativpositionen
    // zählen nicht zur verbindlichen Summe.
    if (to === "VERSENDET" || to === "ANGENOMMEN") {
      const data = await this.repo.forEdit(quoteId);
      const netCents = (data?.lines ?? [])
        .filter((l) => !l.isAlternative)
        .reduce((s, l) => s + l.qty * l.unitNetCents, 0);
      if (netCents <= 0) {
        throw new QuoteError("Angebot ohne werthaltige Position (Netto 0 €) kann nicht versendet/angenommen werden.");
      }
    }
    await this.repo.setStatus(quoteId, to);
    await this.audit.append(buildEntry({ entity: "Quote", entityId: quoteId, action: "UPDATE", after: { status: to } }));
    // Pipeline-Sync: angenommenes Angebot hebt die verknüpfte Verkaufschance auf GEWONNEN.
    if (to === "ANGENOMMEN") await this.repo.markLinkedLeadWon?.(quoteId);
  }

  /** Lehnt ein Angebot mit Pflicht-Verlustgrund ab (F2-Übergang erzwungen). */
  async reject(quoteId: string, verlustgrund: string): Promise<void> {
    const status = await this.repo.getStatus(quoteId);
    if (!status) throw new QuoteError(`Quote ${quoteId} nicht gefunden`);
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
