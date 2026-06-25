import type { CrmStage } from "@texma/shared";
import type { CreateCrmLeadInput, CrmLeadRecord, CrmRepository } from "../modules/crm/crm.service.js";

let seq = 0;

export class InMemoryCrmRepository implements CrmRepository {
  private readonly rows: CrmLeadRecord[] = [];
  private quoteSeq = 0;

  async list(): Promise<CrmLeadRecord[]> {
    return this.rows.map((r) => ({ ...r }));
  }
  async load(id: string): Promise<CrmLeadRecord | null> {
    const r = this.rows.find((x) => x.id === id);
    return r ? { ...r } : null;
  }
  async create(input: CreateCrmLeadInput & { stage: CrmStage }): Promise<CrmLeadRecord> {
    const rec: CrmLeadRecord = {
      id: `crm-${++seq}`, name: input.name, companyId: input.companyId ?? null, contactName: input.contactName ?? null,
      email: input.email ?? null, phone: input.phone ?? null, source: input.source ?? null, stage: input.stage,
      valueCents: input.valueCents ?? null, probability: null, expectedCloseAt: null,
      text: input.text ?? null, note: input.note ?? null, lostReason: null, quoteId: null, createdAt: new Date(0),
    };
    this.rows.push(rec);
    return { ...rec };
  }
  async setStage(id: string, stage: CrmStage, lostReason: string | null): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) { r.stage = stage; r.lostReason = lostReason; }
  }
  async convertToQuote(id: string, _input: { quoteNumber: string; companyId: string; text: string }): Promise<{ quoteId: string }> {
    const r = this.rows.find((x) => x.id === id);
    if (!r || !(r.stage === "NEU" || r.stage === "KONTAKTIERT" || r.stage === "QUALIFIZIERT")) {
      throw new Error(`CRM-Eintrag ${id} ist bereits überführt oder nicht überführbar`);
    }
    const quoteId = `q-${++this.quoteSeq}`;
    r.stage = "ANGEBOT"; r.quoteId = quoteId;
    return { quoteId };
  }
}
