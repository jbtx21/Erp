// In-Memory-ContactLink-Repo für Tests.
import type { ContactLinkRepository, ContactLinkRow, PartyContact } from "../modules/contact/contact-link.service.js";

interface MemContact { id: string; companyId: string; name: string; email: string | null; phone: string | null }

export class InMemoryContactLinkRepository implements ContactLinkRepository {
  private seq = 0;
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
        out.push({ contactId: c.id, name: c.name, email: c.email, phone: c.phone, primary: true, role: null });
      }
    }
    // Dynamic-Links
    for (const l of this.links.filter((x) => x.entity === entity && x.entityId === entityId)) {
      const c = this.contacts.find((x) => x.id === l.contactId);
      if (c && !out.some((o) => o.contactId === c.id)) {
        out.push({ contactId: c.id, name: c.name, email: c.email, phone: c.phone, primary: false, role: l.role });
      }
    }
    return out;
  }
}
