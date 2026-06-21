// In-Memory-Lead-Repository für Unit-Tests/Dev.

import type { LeadStatus } from "@texma/shared";
import type { CreateLeadInput, LeadRepository } from "../modules/lead/lead.service.js";

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  verworfenGrund: string | null;
  convertedCompanyId: string | null;
}

export class InMemoryLeadRepository implements LeadRepository {
  private readonly leads = new Map<string, Lead>();
  private seq = 0;

  get(id: string): Lead | undefined {
    return this.leads.get(id);
  }

  async create(input: CreateLeadInput): Promise<{ id: string }> {
    const id = `lead_${++this.seq}`;
    this.leads.set(id, {
      id,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      status: "NEU",
      verworfenGrund: null,
      convertedCompanyId: null,
    });
    return { id };
  }

  async load(id: string) {
    const l = this.leads.get(id);
    return l ? { status: l.status, name: l.name, email: l.email, phone: l.phone } : null;
  }

  async setStatus(id: string, status: LeadStatus): Promise<void> {
    const l = this.leads.get(id);
    if (l) l.status = status;
  }

  async discard(id: string, grund: string): Promise<void> {
    const l = this.leads.get(id);
    if (l) {
      l.status = "VERWORFEN";
      l.verworfenGrund = grund;
    }
  }

  async convert(id: string): Promise<{ companyId: string }> {
    const l = this.leads.get(id);
    if (!l) throw new Error(`Lead ${id} nicht gefunden`);
    const companyId = `company_${id}`;
    l.status = "KONVERTIERT";
    l.convertedCompanyId = companyId;
    return { companyId };
  }
}
