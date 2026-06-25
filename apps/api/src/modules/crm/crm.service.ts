// Vereinheitlichter CRM-Funnel-Service (IA-Merge): EINE Entität (CrmLead) + EINE
// Statusmaschine löst Lead/Inquiry/Opportunity ab. Anlegen, Funnel-Übergang (F2) und
// Überführung in ein Angebot (eigener Nummernkreis). GoBD-auditiert.

import { crmStageMachine, canConvertCrmToQuote, CrmError, type CrmStage, type InquirySource } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export interface CrmLeadRecord {
  id: string;
  name: string;
  companyId: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  source: InquirySource | null;
  stage: CrmStage;
  valueCents: number | null;
  probability: number | null;
  expectedCloseAt: Date | null;
  text: string | null;
  note: string | null;
  lostReason: string | null;
  quoteId: string | null;
  createdAt: Date;
}

export interface CreateCrmLeadInput {
  name: string;
  companyId?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: InquirySource | null;
  valueCents?: number | null;
  expectedCloseAt?: Date | null;
  text?: string | null;
  note?: string | null;
}

export interface CrmRepository {
  list(): Promise<CrmLeadRecord[]>;
  load(id: string): Promise<CrmLeadRecord | null>;
  create(input: CreateCrmLeadInput & { stage: CrmStage }): Promise<CrmLeadRecord>;
  setStage(id: string, stage: CrmStage, lostReason: string | null): Promise<void>;
  /** Legt das Angebot an, setzt stage=ANGEBOT + quoteId (transaktional). */
  convertToQuote(id: string, input: { quoteNumber: string; companyId: string; text: string }): Promise<{ quoteId: string }>;
}

export class CrmService {
  constructor(
    private readonly repo: CrmRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink
  ) {}

  list(): Promise<CrmLeadRecord[]> {
    return this.repo.list();
  }

  async create(input: CreateCrmLeadInput): Promise<CrmLeadRecord> {
    if (!input.name || !input.name.trim()) throw new CrmError("Name/Bezeichnung ist Pflicht.");
    const rec = await this.repo.create({ ...input, name: input.name.trim(), stage: "NEU" });
    await this.audit.append(buildEntry({ entity: "CrmLead", entityId: rec.id, action: "CREATE", after: { name: rec.name, stage: rec.stage } }));
    return rec;
  }

  /** Funnel-Übergang (F2-geprüft); VERLOREN verlangt einen Grund. */
  async advance(id: string, to: CrmStage, lostReason?: string): Promise<void> {
    const lead = await this.repo.load(id);
    if (!lead) throw new CrmError(`CRM-Eintrag ${id} nicht gefunden.`);
    crmStageMachine.assert(lead.stage, to); // wirft mit klarer Meldung bei illegalem Übergang
    if (to === "VERLOREN" && !(lostReason && lostReason.trim())) {
      throw new CrmError("Verlust-Grund ist Pflicht.");
    }
    await this.repo.setStage(id, to, to === "VERLOREN" ? (lostReason ?? "").trim() : null);
    await this.audit.append(buildEntry({ entity: "CrmLead", entityId: id, action: "UPDATE", before: { stage: lead.stage }, after: { stage: to } }));
  }

  /** Überführt einen offenen CRM-Eintrag in ein Angebot (setzt stage=ANGEBOT). */
  async convertToQuote(id: string): Promise<{ quoteId: string; number: string }> {
    const lead = await this.repo.load(id);
    if (!lead) throw new CrmError(`CRM-Eintrag ${id} nicht gefunden.`);
    if (!canConvertCrmToQuote(lead.stage)) throw new CrmError(`Aus Stufe ${lead.stage} ist keine Angebotsüberführung möglich.`);
    if (!lead.companyId) throw new CrmError("Überführung in ein Angebot erfordert eine zugeordnete Firma.");
    const quoteNumber = await this.numbering.next("QUOTE");
    const { quoteId } = await this.repo.convertToQuote(id, { quoteNumber, companyId: lead.companyId, text: lead.text ?? lead.name });
    await this.audit.append(buildEntry({ entity: "CrmLead", entityId: id, action: "UPDATE", after: { stage: "ANGEBOT", quoteId, quoteNumber } }));
    return { quoteId, number: quoteNumber };
  }
}
