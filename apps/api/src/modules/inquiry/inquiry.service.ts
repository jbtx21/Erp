// Anfrage-Funnel (B20, Kap. 18.1/35.1). Anlage mit AF-Nummer (F1); Funnel-Übergänge
// über F2; Konvertierung Anfrage → Angebot (Quote mit AN-Nummer) übernimmt die Firma.

import {
  assertInquiryDiscardable,
  canConvertToQuote,
  inquiryStatusMachine,
  InquiryError,
  type InquirySource,
  type InquiryStatus,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import { NumberingService } from "../numbering/numbering.service.js";

export interface CreateInquiryInput {
  quelle: InquirySource;
  text: string;
  companyId?: string | null;
  kontaktName?: string | null;
}

export interface InquiryRow {
  id: string;
  number: string;
  companyId: string | null;
  kontaktName: string | null;
  quelle: InquirySource;
  status: InquiryStatus;
  verworfenGrund: string | null;
  text: string;
  quoteId: string | null;
  createdAt: Date;
}

export interface InquiryRepository {
  create(input: CreateInquiryInput & { number: string }): Promise<{ id: string }>;
  list(): Promise<InquiryRow[]>;
  load(id: string): Promise<{ status: InquiryStatus; companyId: string | null } | null>;
  setStatus(id: string, status: InquiryStatus): Promise<void>;
  discard(id: string, grund: string): Promise<void>;
  /** Erzeugt das Angebot, verknüpft es und setzt die Anfrage auf ANGEBOT — atomar. */
  convertToQuote(id: string, input: { quoteNumber: string; companyId: string }): Promise<{ quoteId: string }>;
}

export class InquiryService {
  constructor(
    private readonly repo: InquiryRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  /** Nimmt eine Anfrage auf (Status NEU, AF-Nummer aus F1). */
  async create(input: CreateInquiryInput): Promise<{ id: string; number: string }> {
    if (!input.text || input.text.trim().length === 0) {
      throw new InquiryError("Anfragetext ist Pflicht.");
    }
    const number = await this.numbering.next("INQUIRY");
    const { id } = await this.repo.create({ ...input, number });
    await this.audit.append(
      buildEntry({ entity: "Inquiry", entityId: id, action: "CREATE", after: { number, quelle: input.quelle } })
    );
    return { id, number };
  }

  /** Alle Anfragen (neueste zuerst). */
  async list(): Promise<InquiryRow[]> {
    return this.repo.list();
  }

  /** In Bearbeitung nehmen (NEU → IN_BEARBEITUNG). */
  async startProcessing(id: string): Promise<void> {
    const inq = await this.repo.load(id);
    if (!inq) throw new InquiryError(`Anfrage ${id} nicht gefunden`);
    inquiryStatusMachine.assert(inq.status, "IN_BEARBEITUNG");
    await this.repo.setStatus(id, "IN_BEARBEITUNG");
    await this.audit.append(
      buildEntry({ entity: "Inquiry", entityId: id, action: "UPDATE", after: { status: "IN_BEARBEITUNG" } })
    );
  }

  /** Konvertiert die Anfrage in ein Angebot (Quote, AN-Nummer aus F1). */
  async convertToQuote(id: string): Promise<{ quoteId: string; number: string }> {
    const inq = await this.repo.load(id);
    if (!inq) throw new InquiryError(`Anfrage ${id} nicht gefunden`);
    if (!canConvertToQuote(inq.status)) {
      inquiryStatusMachine.assert(inq.status, "ANGEBOT"); // wirft mit klarer Meldung
    }
    if (!inq.companyId) {
      throw new InquiryError("Konvertierung erfordert eine zugeordnete Firma.");
    }
    const quoteNumber = await this.numbering.next("QUOTE");
    const { quoteId } = await this.repo.convertToQuote(id, { quoteNumber, companyId: inq.companyId });
    await this.audit.append(
      buildEntry({ entity: "Inquiry", entityId: id, action: "UPDATE", after: { status: "ANGEBOT", quoteId, quoteNumber } })
    );
    return { quoteId, number: quoteNumber };
  }

  /** Verwirft die Anfrage mit Pflichtgrund (F2). */
  async discard(id: string, grund: string): Promise<void> {
    const inq = await this.repo.load(id);
    if (!inq) throw new InquiryError(`Anfrage ${id} nicht gefunden`);
    assertInquiryDiscardable(inq.status, grund);
    await this.repo.discard(id, grund.trim());
    await this.audit.append(
      buildEntry({ entity: "Inquiry", entityId: id, action: "UPDATE", after: { status: "VERWORFEN", verworfenGrund: grund.trim() } })
    );
  }
}
