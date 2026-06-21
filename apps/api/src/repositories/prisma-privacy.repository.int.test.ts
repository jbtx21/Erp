// Integrationstest gegen ECHTES Postgres (B12). Anonymisierung überschreibt PII von
// Firma + Kontakt und setzt anonymisiertAm; die Rechnung (WORM/G2) bleibt unverändert.
// Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { ANON_TEXT } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaPrivacyRepository } from "./prisma-privacy.repository.js";
import { PrivacyService } from "../modules/privacy/privacy.service.js";

const PG = "pg_b12";
const CO = "co_b12";
const ORD = "ord_b12";
const INV = "inv_b12";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaPrivacyRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaPrivacyRepository — DSGVO Sperren/Anonymisieren gegen echtes Postgres", () => {
    const service = new PrivacyService(new PrismaPrivacyRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.invoice.deleteMany({ where: { id: INV } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.contact.deleteMany({ where: { companyId: CO } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "Muster GmbH", branche: "Textil", priceGroupId: PG } });
      await prisma.contact.create({ data: { companyId: CO, firstName: "Max", lastName: "Muster", email: "m@x.de", phone: "0123", role: "Einkauf" } });
      await prisma.order.create({ data: { id: ORD, number: "AB-B12-1", companyId: CO } });
      await prisma.invoice.create({ data: { id: INV, number: "RE-B12-1", orderId: ORD, companyId: CO, netCents: 5000, taxCents: 950, grossCents: 5950, finalized: true } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("sperrt Firma + Kontakte", async () => {
      const at = new Date(Date.UTC(2026, 5, 1));
      await service.block(CO, at);
      expect((await prisma.company.findUnique({ where: { id: CO } }))?.gesperrtAm).toEqual(at);
      expect((await prisma.contact.findFirst({ where: { companyId: CO } }))?.gesperrtAm).toEqual(at);
    });

    it("anonymisiert PII, lässt die Rechnung unverändert (WORM)", async () => {
      const invBefore = await prisma.invoice.findUnique({ where: { id: INV } });
      const at = new Date(Date.UTC(2026, 5, 2));

      const count = await service.anonymize(CO, at);
      expect(count).toBe(1);

      const company = await prisma.company.findUnique({ where: { id: CO } });
      expect(company).toMatchObject({ name: ANON_TEXT, branche: "Textil", anonymisiertAm: at });

      const contact = await prisma.contact.findFirst({ where: { companyId: CO } });
      expect(contact).toMatchObject({ firstName: ANON_TEXT, lastName: ANON_TEXT, email: null, phone: null, role: "Einkauf" });

      // Beleg unverändert (Nummer/Beträge/finalized/companyId).
      const invAfter = await prisma.invoice.findUnique({ where: { id: INV } });
      expect(invAfter).toEqual(invBefore);
    });
  });
}
