// Integrationstest gegen ECHTES Postgres: Contact-Dynamic-Link verknüpft eine Person
// mit mehreren Firmen; contactsForEntity liefert Stammkontakte + Dynamic-Links. Nur RUN_DB_TESTS=1.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { ContactLinkService } from "../modules/contact/contact-link.service.js";
import { PrismaContactLinkRepository } from "./prisma-contact-link.repository.js";

const PG = "pg_cl_unique";
const C1 = "co_cl_1";
const C2 = "co_cl_2";
const P1 = "ct_cl_1";
const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaContactLinkRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaContactLinkRepository — Dynamic-Link gegen echtes Postgres", () => {
    const service = new ContactLinkService(new PrismaContactLinkRepository(), new MemoryAuditSink());

    // Eigene PriceGroup mit fester id, in cleanup per id gelöscht (Konvention der
    // Int-Tests). Im seriellen Lauf kollidiert der globale Unique-Wert kind nicht, da
    // jede Datei ihre PriceGroup vor der nächsten wieder entfernt.
    async function cleanup() {
      await prisma.contactLink.deleteMany({ where: { contactId: P1 } });
      await prisma.contact.deleteMany({ where: { id: P1 } });
      await prisma.company.deleteMany({ where: { id: { in: [C1, C2] } } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }
    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: C1, name: "Acme", priceGroupId: PG } });
      await prisma.company.create({ data: { id: C2, name: "Globex", priceGroupId: PG } });
      await prisma.contact.create({ data: { id: P1, companyId: C1, firstName: "Anna", lastName: "Muster", email: "anna@acme.de" } });
    });
    afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

    it("verknüpft die Person zusätzlich mit Globex und liest beide Seiten", async () => {
      const r = await service.link(P1, "Company", C2, "Einkauf");
      expect(r.created).toBe(true);

      const acme = await service.contactsForEntity("Company", C1);
      expect(acme.find((c) => c.contactId === P1)?.primary).toBe(true);

      const globex = await service.contactsForEntity("Company", C2);
      expect(globex.find((c) => c.contactId === P1)).toMatchObject({ primary: false, role: "Einkauf" });

      // idempotent
      expect((await service.link(P1, "Company", C2)).created).toBe(false);
    });
  });
}
