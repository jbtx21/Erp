// Prisma-ContactLink-Repo (Produktionspfad).
import { prisma } from "@texma/db";
import type { ContactLinkRepository, ContactLinkRow, PartyContact } from "../modules/contact/contact-link.service.js";

const fullName = (c: { firstName: string; lastName: string }): string => `${c.firstName} ${c.lastName}`.trim();

export class PrismaContactLinkRepository implements ContactLinkRepository {
  async contactExists(contactId: string): Promise<boolean> {
    return (await prisma.contact.count({ where: { id: contactId } })) > 0;
  }

  async create(input: { contactId: string; entity: string; entityId: string; role: string | null }): Promise<{ id: string; created: boolean }> {
    const existing = await prisma.contactLink.findUnique({ where: { contactId_entity_entityId: { contactId: input.contactId, entity: input.entity, entityId: input.entityId } }, select: { id: true } });
    if (existing) return { id: existing.id, created: false };
    const row = await prisma.contactLink.create({ data: input, select: { id: true } });
    return { id: row.id, created: true };
  }

  async delete(id: string): Promise<void> {
    await prisma.contactLink.deleteMany({ where: { id } });
  }

  async linksForContact(contactId: string): Promise<ContactLinkRow[]> {
    return prisma.contactLink.findMany({ where: { contactId }, select: { id: true, contactId: true, entity: true, entityId: true, role: true } });
  }

  async contactsForEntity(entity: string, entityId: string): Promise<PartyContact[]> {
    const out: PartyContact[] = [];
    if (entity === "Company") {
      const primary = await prisma.contact.findMany({ where: { companyId: entityId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } });
      for (const c of primary) out.push({ contactId: c.id, name: fullName(c), email: c.email, phone: c.phone, primary: true, role: null });
    }
    const links = await prisma.contactLink.findMany({ where: { entity, entityId }, select: { role: true, contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } });
    for (const l of links) {
      if (!out.some((o) => o.contactId === l.contact.id)) {
        out.push({ contactId: l.contact.id, name: fullName(l.contact), email: l.contact.email, phone: l.contact.phone, primary: false, role: l.role });
      }
    }
    return out;
  }
}
