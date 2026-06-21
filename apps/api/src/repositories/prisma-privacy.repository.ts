// Prisma-Implementierung der DSGVO-Funktionen (Produktionspfad, B12). Anonymisierung
// überschreibt PII von Firma + Kontakten in EINER Transaktion; Belege bleiben außen vor.

import { prisma } from "@texma/db";
import { anonymizeCompany, anonymizeContact } from "@texma/shared";
import type { PrivacyRepository } from "../modules/privacy/privacy.service.js";

export class PrismaPrivacyRepository implements PrivacyRepository {
  async block(companyId: string, at: Date): Promise<void> {
    await prisma.$transaction([
      prisma.company.update({ where: { id: companyId }, data: { gesperrtAm: at } }),
      prisma.contact.updateMany({ where: { companyId }, data: { gesperrtAm: at } }),
    ]);
  }

  async anonymize(companyId: string, at: Date): Promise<{ contactsAnonymized: number } | null> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { branche: true, contacts: { select: { id: true, role: true } } },
    });
    if (!company) return null;

    const anonCompany = anonymizeCompany({ name: "", branche: company.branche });
    const ops = [
      prisma.company.update({
        where: { id: companyId },
        data: { name: anonCompany.name, branche: anonCompany.branche, anonymisiertAm: at },
      }),
      ...company.contacts.map((k) => {
        const a = anonymizeContact({ firstName: "", lastName: "", role: k.role });
        return prisma.contact.update({
          where: { id: k.id },
          data: { firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, anonymisiertAm: at },
        });
      }),
    ];
    await prisma.$transaction(ops);
    return { contactsAnonymized: company.contacts.length };
  }
}
