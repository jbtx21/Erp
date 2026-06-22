// Prisma-Newsletter-Repository: Kampagnen + Empfänger-Kontakte (Opt-in).

import { prisma } from "@texma/db";
import type { NewsletterContact } from "@texma/shared";
import type { CampaignRow, NewsletterRepository } from "../modules/newsletter/newsletter.service.js";

export class PrismaNewsletterRepository implements NewsletterRepository {
  async listCampaigns(): Promise<CampaignRow[]> {
    const rows = await prisma.newsletterCampaign.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map((c) => ({ id: c.id, subject: c.subject, body: c.body, status: c.status as "ENTWURF" | "GESENDET", recipientCount: c.recipientCount, sentAt: c.sentAt }));
  }
  async createCampaign(subject: string, body: string): Promise<{ id: string }> {
    return prisma.newsletterCampaign.create({ data: { subject, body }, select: { id: true } });
  }
  async getCampaign(id: string): Promise<CampaignRow | null> {
    const c = await prisma.newsletterCampaign.findUnique({ where: { id } });
    return c ? { id: c.id, subject: c.subject, body: c.body, status: c.status as "ENTWURF" | "GESENDET", recipientCount: c.recipientCount, sentAt: c.sentAt } : null;
  }
  async markSent(id: string, recipientCount: number, providerRef: string | null): Promise<void> {
    await prisma.newsletterCampaign.update({ where: { id }, data: { status: "GESENDET", recipientCount, providerRef, sentAt: new Date() } });
  }
  async audienceContacts(): Promise<NewsletterContact[]> {
    const rows = await prisma.contact.findMany({
      where: { newsletterOptIn: true, gesperrtAm: null, anonymisiertAm: null, email: { not: null } },
      select: { email: true, firstName: true, lastName: true, newsletterOptIn: true, gesperrtAm: true, anonymisiertAm: true },
    });
    return rows.map((r) => ({ email: r.email, firstName: r.firstName, lastName: r.lastName, newsletterOptIn: r.newsletterOptIn, gesperrt: !!r.gesperrtAm, anonymisiert: !!r.anonymisiertAm }));
  }
}
