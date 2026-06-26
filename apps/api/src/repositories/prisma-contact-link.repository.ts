// Prisma-ContactLink-Repo (Produktionspfad).
import { prisma } from "@texma/db";
import type { ContactFields, ContactLinkRepository, ContactLinkRow, PartyContact } from "../modules/contact/contact-link.service.js";

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
      const primary = await prisma.contact.findMany({ where: { companyId: entityId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true } });
      for (const c of primary) out.push({ contactId: c.id, name: fullName(c), firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, primary: true, role: c.role });
    }
    const links = await prisma.contactLink.findMany({ where: { entity, entityId }, select: { role: true, contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } });
    for (const l of links) {
      if (!out.some((o) => o.contactId === l.contact.id)) {
        out.push({ contactId: l.contact.id, name: fullName(l.contact), firstName: l.contact.firstName, lastName: l.contact.lastName, email: l.contact.email, phone: l.contact.phone, primary: false, role: l.role });
      }
    }
    return out;
  }

  async createContact(input: { companyId: string } & ContactFields): Promise<{ id: string }> {
    const row = await prisma.contact.create({
      data: { companyId: input.companyId, firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, phone: input.phone ?? null, role: input.role ?? null },
      select: { id: true },
    });
    return { id: row.id };
  }

  async updateContact(id: string, fields: Partial<ContactFields>): Promise<void> {
    const pick = <K extends keyof ContactFields>(k: K): object => (fields[k] !== undefined ? { [k]: fields[k] } : {});
    await prisma.contact.update({ where: { id }, data: { ...pick("firstName"), ...pick("lastName"), ...pick("email"), ...pick("phone"), ...pick("role") } });
  }

  async deleteContact(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.contactLink.deleteMany({ where: { contactId: id } });
      await tx.contact.delete({ where: { id } });
    });
  }

  async contactCompanyId(id: string): Promise<string | null> {
    const c = await prisma.contact.findUnique({ where: { id }, select: { companyId: true } });
    return c?.companyId ?? null;
  }
}
