// Prisma-Implementierung des Leads (Produktionspfad, B15). Konvertierung erzeugt
// eine Company (Standard-Preisgruppe) + optionalen Kontakt und verknüpft sie atomar;
// ein Gate auf QUALIFIZIERT verhindert Doppelkonversion.

import { prisma } from "@texma/db";
import type { LeadStatus } from "@texma/shared";
import type { CreateLeadInput, LeadRepository, LeadRow } from "../modules/lead/lead.service.js";
import type { InquirySource } from "@texma/shared";

export class PrismaLeadRepository implements LeadRepository {
  async list(): Promise<LeadRow[]> {
    const rows = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map((l) => ({ ...l, quelle: l.quelle as InquirySource, status: l.status as LeadStatus }));
  }

  async create(input: CreateLeadInput): Promise<{ id: string }> {
    return prisma.lead.create({
      data: {
        name: input.name,
        quelle: input.quelle,
        firma: input.firma ?? null,
        webseite: input.webseite ?? null,
        verantwortlicher: input.verantwortlicher ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        note: input.note ?? null,
      },
      select: { id: true },
    });
  }

  async load(id: string) {
    const l = await prisma.lead.findUnique({ where: { id }, select: { status: true, name: true, firma: true, email: true, phone: true } });
    return l ? { status: l.status as LeadStatus, name: l.name, firma: l.firma, email: l.email, phone: l.phone } : null;
  }

  async setStatus(id: string, status: LeadStatus): Promise<void> {
    await prisma.lead.update({ where: { id }, data: { status } });
  }

  async discard(id: string, grund: string): Promise<void> {
    await prisma.lead.update({ where: { id }, data: { status: "VERWORFEN", verworfenGrund: grund } });
  }

  async convert(id: string, input: { name: string; firma: string | null; email: string | null; phone: string | null; customerNumber: string }): Promise<{ companyId: string }> {
    const priceGroup = await prisma.priceGroup.findUnique({ where: { kind: "STANDARD" }, select: { id: true } });
    if (!priceGroup) throw new Error("Standard-Preisgruppe fehlt — Lead-Konvertierung nicht möglich");

    return prisma.$transaction(async (tx) => {
      // Gate: nur aus QUALIFIZIERT, race-frei.
      const gate = await tx.lead.updateMany({
        where: { id, status: "QUALIFIZIERT" },
        data: { status: "KONVERTIERT" },
      });
      if (gate.count === 0) throw new Error(`Lead ${id} ist nicht (mehr) konvertierbar`);

      // B2B: Firmenname = firma (falls erfasst), die Person wird zum Ansprechpartner.
      const company = await tx.company.create({
        data: {
          name: input.firma?.trim() || input.name,
          customerNumber: input.customerNumber,
          email: input.email,
          priceGroupId: priceGroup.id,
          contacts:
            input.email || input.phone
              ? { create: [{ firstName: "", lastName: input.name, email: input.email, phone: input.phone, role: "Ansprechpartner" }] }
              : undefined,
        },
        select: { id: true },
      });
      await tx.lead.update({ where: { id }, data: { convertedCompanyId: company.id } });
      return { companyId: company.id };
    });
  }
}
