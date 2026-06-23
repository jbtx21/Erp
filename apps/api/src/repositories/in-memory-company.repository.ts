// In-Memory-Firmen-Repository für Unit-Tests/Dev.

import type { PriceGroupKind } from "@texma/shared";
import type {
  CompanyOverview,
  CompanyRepository,
  CompanyRow,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "../modules/company/company.service.js";

const STAMMDATEN_KEYS = ["street", "zip", "city", "country", "vatId", "taxNumber", "skontoPercent", "skontoDays", "paymentMethod", "lieferbedingung", "notiz", "kreditlimitCents"] as const;

export class InMemoryCompanyRepository implements CompanyRepository {
  private readonly companies = new Map<string, CompanyRow>();
  private readonly stammdaten = new Map<string, string | number | null>();
  private seq = 0;

  async list(): Promise<CompanyRow[]> {
    return [...this.companies.values()].map((c) => ({ ...c })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(input: CreateCompanyInput): Promise<{ id: string }> {
    const id = `co_${++this.seq}`;
    this.companies.set(id, {
      id,
      name: input.name,
      branche: input.branche ?? null,
      zahlungszielTage: input.zahlungszielTage ?? 14,
      mahnsperre: false,
      priceGroupKind: input.priceGroupKind as PriceGroupKind,
      gesperrt: false,
    });
    return { id };
  }

  async update(input: UpdateCompanyInput): Promise<void> {
    const c = this.companies.get(input.id);
    if (!c) return;
    if (input.name !== undefined) c.name = input.name;
    if (input.branche !== undefined) c.branche = input.branche;
    if (input.zahlungszielTage !== undefined) c.zahlungszielTage = input.zahlungszielTage;
    if (input.mahnsperre !== undefined) c.mahnsperre = input.mahnsperre;
    for (const k of STAMMDATEN_KEYS) {
      if (input[k] !== undefined) this.stammdaten.set(`${input.id}:${k}`, input[k] as string | number | null);
    }
  }

  async overview(companyId: string): Promise<CompanyOverview | null> {
    const c = this.companies.get(companyId);
    if (!c) return null;
    const sd = <T>(k: string, fallback: T): T => (this.stammdaten.has(`${companyId}:${k}`) ? (this.stammdaten.get(`${companyId}:${k}`) as T) : fallback);
    return {
      company: {
        ...c, fromLead: false,
        street: sd("street", null), zip: sd("zip", null), city: sd("city", null), country: sd("country", "DE"),
        vatId: sd("vatId", null), taxNumber: sd("taxNumber", null),
        skontoPercent: sd("skontoPercent", null), skontoDays: sd("skontoDays", null), paymentMethod: sd("paymentMethod", null),
        lieferbedingung: sd("lieferbedingung", null), notiz: sd("notiz", null), kreditlimitCents: sd("kreditlimitCents", null),
      },
      contactsCount: 0, orders: [], quotes: [], invoices: [], sampleLoans: [], openCents: 0,
    };
  }
}
