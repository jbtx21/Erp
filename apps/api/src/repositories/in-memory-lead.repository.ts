// In-Memory-Lead-Repository für Unit-Tests/Dev.

import type { InquirySource, LeadStatus } from "@texma/shared";
import type { CreateLeadInput, LeadRepository, LeadRow } from "../modules/lead/lead.service.js";

interface Lead {
  id: string;
  name: string;
  firma: string | null;
  webseite: string | null;
  verantwortlicher: string | null;
  email: string | null;
  phone: string | null;
  quelle: InquirySource;
  note: string | null;
  status: LeadStatus;
  verworfenGrund: string | null;
  convertedCompanyId: string | null;
  createdAt: Date;
}

export class InMemoryLeadRepository implements LeadRepository {
  private readonly leads = new Map<string, Lead>();
  private seq = 0;

  get(id: string): Lead | undefined {
    return this.leads.get(id);
  }

  async list(): Promise<LeadRow[]> {
    return [...this.leads.values()].map((l) => ({ ...l })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(input: CreateLeadInput): Promise<{ id: string }> {
    const id = `lead_${++this.seq}`;
    this.leads.set(id, {
      id,
      name: input.name,
      firma: input.firma ?? null,
      webseite: input.webseite ?? null,
      verantwortlicher: input.verantwortlicher ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      quelle: input.quelle,
      note: input.note ?? null,
      status: "NEU",
      verworfenGrund: null,
      convertedCompanyId: null,
      createdAt: new Date(),
    });
    return { id };
  }

  async load(id: string) {
    const l = this.leads.get(id);
    return l ? { status: l.status, name: l.name, firma: l.firma, email: l.email, phone: l.phone } : null;
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

  async convert(
    id: string,
    _input: { name: string; firma: string | null; email: string | null; phone: string | null }
  ): Promise<{ companyId: string }> {
    const l = this.leads.get(id);
    if (!l) throw new Error(`Lead ${id} nicht gefunden`);
    // Gate wie im Prisma-Repo: nur aus QUALIFIZIERT (kein Divergieren der Pfade).
    if (l.status !== "QUALIFIZIERT") throw new Error(`Lead ${id} ist nicht (mehr) konvertierbar`);
    const companyId = `company_${id}`;
    l.status = "KONVERTIERT";
    l.convertedCompanyId = companyId;
    return { companyId };
  }
}
