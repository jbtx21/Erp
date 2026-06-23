// Firmen/Kunden-Stammdaten (B3). Anlegen/Bearbeiten/Auflisten — reine Stammdaten,
// keine Buchung (G1). Sperren/Anonymisieren liegt im Privacy-Modul (DSGVO), hier nur
// die operativen Felder (Name, Branche, Zahlungsziel, Mahnsperre, Preisgruppe).

import type { PriceGroupKind } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface CompanyRow {
  id: string;
  name: string;
  branche: string | null;
  zahlungszielTage: number;
  mahnsperre: boolean;
  priceGroupKind: PriceGroupKind;
  gesperrt: boolean;
}

export interface CreateCompanyInput {
  name: string;
  branche?: string | null;
  zahlungszielTage?: number;
  priceGroupKind: PriceGroupKind;
}

export interface UpdateCompanyInput {
  id: string;
  name?: string;
  branche?: string | null;
  zahlungszielTage?: number;
  mahnsperre?: boolean;
}

/** Kunden-Detail + Historie (klickbar im Kundenstamm). */
export interface CompanyOverview {
  company: CompanyRow & { fromLead: boolean };
  contactsCount: number;
  orders: Array<{ id: string; number: string; status: string; createdAt: Date }>;
  quotes: Array<{ id: string; number: string; status: string; createdAt: Date }>;
  invoices: Array<{ id: string; number: string; grossCents: number; issuedAt: Date }>;
  sampleLoans: Array<{ id: string; status: string; ausgegebenAm: Date }>;
  openCents: number;
}

export interface CompanyRepository {
  list(): Promise<CompanyRow[]>;
  create(input: Required<Pick<CreateCompanyInput, "name" | "priceGroupKind">> & CreateCompanyInput): Promise<{ id: string }>;
  update(input: UpdateCompanyInput): Promise<void>;
  overview(companyId: string): Promise<CompanyOverview | null>;
}

export class CompanyError extends Error {}

export class CompanyService {
  constructor(
    private readonly repo: CompanyRepository,
    private readonly audit: AuditSink
  ) {}

  async list(): Promise<CompanyRow[]> {
    return this.repo.list();
  }

  /** Kunden-Detail + Historie (Aufträge/Angebote/Rechnungen/Leihgut). */
  overview(companyId: string): Promise<CompanyOverview | null> {
    return this.repo.overview(companyId);
  }

  async create(input: CreateCompanyInput): Promise<{ id: string }> {
    if (!input.name?.trim()) throw new CompanyError("Name ist Pflicht.");
    const res = await this.repo.create({ ...input, name: input.name.trim() });
    await this.audit.append(
      buildEntry({ entity: "Company", entityId: res.id, action: "CREATE", after: { name: input.name, priceGroupKind: input.priceGroupKind } })
    );
    return res;
  }

  async update(input: UpdateCompanyInput): Promise<void> {
    if (input.name !== undefined && !input.name.trim()) throw new CompanyError("Name darf nicht leer sein.");
    await this.repo.update({ ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) });
    await this.audit.append(buildEntry({ entity: "Company", entityId: input.id, action: "UPDATE", after: { ...input } }));
  }
}
