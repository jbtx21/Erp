// In-Memory-Lieferadressen-Repo für Unit-Tests/Dev.

import type { AddressFields, AddressRow, CompanyAddressRepository } from "../modules/company/company-address.service.js";

interface MemAddr extends AddressRow { companyId: string }

export class InMemoryCompanyAddressRepository implements CompanyAddressRepository {
  private readonly addrs = new Map<string, MemAddr>();
  private seq = 0;
  /** Test-Hilfe: simulierte Auftragsreferenzen je Adresse (Default 0). */
  readonly orderCounts = new Map<string, number>();

  async list(companyId: string): Promise<AddressRow[]> {
    return [...this.addrs.values()]
      .filter((a) => a.companyId === companyId)
      .sort((a, b) => (a.isDefault === b.isDefault ? a.label.localeCompare(b.label) : a.isDefault ? -1 : 1))
      .map(({ companyId: _c, ...row }) => row);
  }

  async create(companyId: string, fields: Required<AddressFields>, makeDefault: boolean): Promise<{ id: string }> {
    const id = `da_${String(++this.seq)}`;
    if (makeDefault) for (const a of this.addrs.values()) if (a.companyId === companyId) a.isDefault = false;
    this.addrs.set(id, { id, companyId, ...fields, isDefault: makeDefault });
    return { id };
  }

  async update(id: string, fields: Partial<Required<AddressFields>>): Promise<void> {
    const a = this.addrs.get(id);
    if (!a) return;
    Object.assign(a, fields);
  }

  async companyIdOf(id: string): Promise<string | null> {
    return this.addrs.get(id)?.companyId ?? null;
  }

  async orderCount(id: string): Promise<number> {
    return this.orderCounts.get(id) ?? 0;
  }

  async delete(id: string): Promise<void> {
    this.addrs.delete(id);
  }

  async setDefault(companyId: string, id: string): Promise<void> {
    for (const a of this.addrs.values()) if (a.companyId === companyId) a.isDefault = a.id === id;
  }
}
