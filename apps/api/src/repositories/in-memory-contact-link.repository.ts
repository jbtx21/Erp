// In-Memory-ContactLink-Repo für Tests.
import type { ContactFields, ContactLinkRepository, ContactLinkRow, PartyContact } from "../modules/contact/contact-link.service.js";

interface MemContact { id: string; companyId: string; firstName: string; lastName: string; email: string | null; phone: string | null; role: string | null }

const memName = (c: { firstName: string; lastName: string }): string => `${c.firstName} ${c.lastName}`.trim();

export class InMemoryContactLinkRepository implements ContactLinkRepository {
  private seq = 0;
  private cSeq = 0;
  private readonly links: (ContactLinkRow & { createdAt: number })[] = [];
  constructor(private readonly contacts: MemContact[] = []) {}

  async contactExists(contactId: string): Promise<boolean> {
    return this.contacts.some((c) => c.id === contactId);
  }
  async create(input: { contactId: string; entity: string; entityId: string; role: string | null }): Promise<{ id: string; created: boolean }> {
    const existing = this.links.find((l) => l.contactId === input.contactId && l.entity === input.entity && l.entityId === input.entityId);
    if (existing) return { id: existing.id, created: false };
    const id = `cl_${String(++this.seq)}`;
    this.links.push({ id, ...input, createdAt: Date.now() });
    return { id, created: true };
  }
  async delete(id: string): Promise<void> {
    const i = this.links.findIndex((l) => l.id === id);
    if (i >= 0) this.links.splice(i, 1);
  }
  async linksForContact(contactId: string): Promise<ContactLinkRow[]> {
    return this.links.filter((l) => l.contactId === contactId).map(({ createdAt: _c, ...row }) => row);
  }
  async contactsForEntity(entity: string, entityId: string): Promise<PartyContact[]> {
    const out: PartyContact[] = [];
    // Stammkontakte (nur Company): Contact.companyId
    if (entity === "Company") {
      for (const c of this.contacts.filter((x) => x.companyId === entityId)) {
        out.push({ contactId: c.id, name: memName(c), firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, primary: true, role: c.role });
      }
    }
    // Dynamic-Links
    for (const l of this.links.filter((x) => x.entity === entity && x.entityId === entityId)) {
      const c = this.contacts.find((x) => x.id === l.contactId);
      if (c && !out.some((o) => o.contactId === c.id)) {
        out.push({ contactId: c.id, name: memName(c), firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, primary: false, role: l.role });
      }
    }
    return out;
  }

  async createContact(input: { companyId: string } & ContactFields): Promise<{ id: string }> {
    const id = `ct_${String(++this.cSeq)}`;
    this.contacts.push({ id, companyId: input.companyId, firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, phone: input.phone ?? null, role: input.role ?? null });
    return { id };
  }

  async updateContact(id: string, fields: Partial<ContactFields>): Promise<void> {
    const c = this.contacts.find((x) => x.id === id);
    if (!c) return;
    if (fields.firstName !== undefined) c.firstName = fields.firstName;
    if (fields.lastName !== undefined) c.lastName = fields.lastName;
    if (fields.email !== undefined) c.email = fields.email ?? null;
    if (fields.phone !== undefined) c.phone = fields.phone ?? null;
    if (fields.role !== undefined) c.role = fields.role ?? null;
  }

  async deleteContact(id: string): Promise<void> {
    const i = this.contacts.findIndex((x) => x.id === id);
    if (i >= 0) this.contacts.splice(i, 1);
    for (let j = this.links.length - 1; j >= 0; j--) if (this.links[j]!.contactId === id) this.links.splice(j, 1);
  }

  async contactCompanyId(id: string): Promise<string | null> {
    return this.contacts.find((x) => x.id === id)?.companyId ?? null;
  }
}
