// In-Memory-Firmen-Repository für Unit-Tests/Dev.

import type { PriceGroupKind } from "@texma/shared";
import type {
  CompanyRepository,
  CompanyRow,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "../modules/company/company.service.js";

export class InMemoryCompanyRepository implements CompanyRepository {
  private readonly companies = new Map<string, CompanyRow>();
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
  }
}
