// In-Memory-Privacy-Repository für Unit-Tests/Dev.

import { anonymizeCompany, anonymizeContact, type ContactPII } from "@texma/shared";
import type { PrivacyRepository } from "../modules/privacy/privacy.service.js";

interface Company {
  id: string;
  name: string;
  branche: string | null;
  gesperrtAm: Date | null;
  anonymisiertAm: Date | null;
  contacts: (ContactPII & { gesperrtAm: Date | null; anonymisiertAm: Date | null })[];
}

export class InMemoryPrivacyRepository implements PrivacyRepository {
  private readonly companies = new Map<string, Company>();

  seed(company: Company): void {
    this.companies.set(company.id, company);
  }

  get(id: string): Company | undefined {
    return this.companies.get(id);
  }

  async block(companyId: string, at: Date): Promise<void> {
    const c = this.companies.get(companyId);
    if (!c) return;
    c.gesperrtAm = at;
    for (const k of c.contacts) k.gesperrtAm = at;
  }

  async anonymize(companyId: string, at: Date): Promise<{ contactsAnonymized: number } | null> {
    const c = this.companies.get(companyId);
    if (!c) return null;
    const anon = anonymizeCompany({ name: c.name, branche: c.branche });
    c.name = anon.name;
    c.branche = anon.branche ?? null;
    c.anonymisiertAm = at;
    for (const k of c.contacts) {
      const a = anonymizeContact(k);
      k.firstName = a.firstName;
      k.lastName = a.lastName;
      k.email = a.email;
      k.phone = a.phone;
      k.anonymisiertAm = at;
    }
    return { contactsAnonymized: c.contacts.length };
  }
}
