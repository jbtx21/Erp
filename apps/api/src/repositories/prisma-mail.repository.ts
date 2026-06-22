// Prisma-Maileingang: Kontakt-E-Mails für den Abgleich + idempotente Anfrage-Anlage.

import { prisma } from "@texma/db";
import type { CompanyEmailRef } from "@texma/shared";
import type { MailIntakeRepository } from "../modules/mail/mail.service.js";

export class PrismaMailIntakeRepository implements MailIntakeRepository {
  async companyEmailRefs(): Promise<CompanyEmailRef[]> {
    const rows = await prisma.contact.findMany({
      where: { email: { not: null }, gesperrtAm: null },
      select: { companyId: true, email: true },
    });
    return rows.filter((r): r is { companyId: string; email: string } => !!r.email);
  }
  async inquiryExists(externalRef: string): Promise<boolean> {
    return (await prisma.inquiry.count({ where: { externalRef } })) > 0;
  }
  async createInquiry(input: { number: string; text: string; companyId: string | null; kontaktName: string | null; externalRef: string }): Promise<{ id: string }> {
    return prisma.inquiry.create({
      data: {
        number: input.number, text: input.text, quelle: "EMAIL",
        companyId: input.companyId, kontaktName: input.kontaktName, externalRef: input.externalRef,
      },
      select: { id: true },
    });
  }
}
