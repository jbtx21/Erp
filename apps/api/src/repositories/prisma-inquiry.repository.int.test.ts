// Integrationstest gegen ECHTES Postgres (B20). Funnel: Anfrage (AF-Nummer) → in
// Bearbeitung → Angebot (Quote mit AN-Nummer, verknüpft); Verwerfen mit Pflichtgrund.
// Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { InquiryError } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaInquiryRepository } from "./prisma-inquiry.repository.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";
import { InquiryService } from "../modules/inquiry/inquiry.service.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";

const PG = "pg_b20";
const CO = "co_b20";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaInquiryRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaInquiryRepository — Anfrage-Funnel gegen echtes Postgres", () => {
    const service = new InquiryService(
      new PrismaInquiryRepository(),
      new NumberingService(new PrismaNumberingRepository()),
      new MemoryAuditSink()
    );

    async function cleanup() {
      await prisma.inquiry.deleteMany({ where: { OR: [{ companyId: CO }, { companyId: null }] } });
      await prisma.quote.deleteMany({ where: { companyId: CO } });
      await prisma.numberSequence.deleteMany({ where: { year: new Date().getUTCFullYear(), key: { in: ["INQUIRY", "QUOTE"] } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("konvertiert Anfrage → Angebot mit verknüpfter Quote", async () => {
      const inq = await service.create({ quelle: "EMAIL", text: "Bitte 50 Polos besticken", companyId: CO, kontaktName: "Max" });
      expect(inq.number).toMatch(/^AF-\d{4}-\d{4}$/);

      await service.startProcessing(inq.id);
      const conv = await service.convertToQuote(inq.id);
      expect(conv.number).toMatch(/^AN-\d{4}-\d{4}$/);

      const reloaded = await prisma.inquiry.findUnique({ where: { id: inq.id } });
      expect(reloaded).toMatchObject({ status: "ANGEBOT", quoteId: conv.quoteId });
      const quote = await prisma.quote.findUnique({ where: { id: conv.quoteId } });
      expect(quote).toMatchObject({ companyId: CO, status: "ENTWURF" });
    });

    it("Verwerfen verlangt einen Grund; danach keine Konversion mehr", async () => {
      const inq = await service.create({ quelle: "WEB", text: "Preisanfrage", companyId: CO });
      await expect(service.discard(inq.id, "  ")).rejects.toBeInstanceOf(InquiryError);

      await service.discard(inq.id, "Budget zu klein");
      expect((await prisma.inquiry.findUnique({ where: { id: inq.id } }))?.status).toBe("VERWORFEN");
      await expect(service.convertToQuote(inq.id)).rejects.toBeTruthy();
    });
  });
}
