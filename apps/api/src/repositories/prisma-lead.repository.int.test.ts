// Integrationstest gegen ECHTES Postgres (B15). Funnel + Konvertierung Lead→Company
// (mit Kontakt); Verwerfen mit Pflichtgrund. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { LeadError } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaLeadRepository } from "./prisma-lead.repository.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";
import { LeadService } from "../modules/lead/lead.service.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";

const PG = "pg_b15";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaLeadRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaLeadRepository — Lead-Funnel + Konvertierung gegen echtes Postgres", () => {
    const service = new LeadService(new PrismaLeadRepository(), new MemoryAuditSink(), new NumberingService(new PrismaNumberingRepository()));
    const createdCompanies: string[] = [];

    async function cleanup() {
      const leads = await prisma.lead.findMany({ where: { name: { startsWith: "B15-" } }, select: { convertedCompanyId: true } });
      const companyIds = leads.map((l) => l.convertedCompanyId).filter((x): x is string => !!x);
      await prisma.lead.deleteMany({ where: { name: { startsWith: "B15-" } } });
      await prisma.contact.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("konvertiert einen qualifizierten Lead zu Company + Kontakt", async () => {
      const lead = await service.create({ name: "B15-Acme", quelle: "WEB", email: "info@acme.de", phone: "0123" });
      await service.transition(lead.id, "QUALIFIZIERT");
      const conv = await service.convert(lead.id);
      createdCompanies.push(conv.companyId);

      const company = await prisma.company.findUnique({ where: { id: conv.companyId }, select: { name: true, priceGroupId: true, customerNumber: true, email: true } });
      expect(company).toMatchObject({ name: "B15-Acme", priceGroupId: PG, email: "info@acme.de" });
      // Sprechende Kundennummer (KD-JJJJ-NNNN) wird wie bei direkter Anlage vergeben.
      expect(company?.customerNumber).toMatch(/^KD-\d{4}-\d{4}$/);
      const contact = await prisma.contact.findFirst({ where: { companyId: conv.companyId } });
      expect(contact).toMatchObject({ lastName: "B15-Acme", email: "info@acme.de" });

      const reloaded = await prisma.lead.findUnique({ where: { id: lead.id } });
      expect(reloaded).toMatchObject({ status: "KONVERTIERT", convertedCompanyId: conv.companyId });

      // Erneute Konvertierung nicht mehr möglich.
      await expect(service.convert(lead.id)).rejects.toBeTruthy();
    });

    it("nicht-qualifizierter Lead ist nicht konvertierbar; Verwerfen verlangt Grund", async () => {
      const lead = await service.create({ name: "B15-Reject", quelle: "TELEFON" });
      await expect(service.convert(lead.id)).rejects.toBeTruthy();
      await expect(service.discard(lead.id, "  ")).rejects.toBeInstanceOf(LeadError);
      await service.discard(lead.id, "kein Bedarf");
      expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.status).toBe("VERWORFEN");
    });
  });
}
