// Integrationstest gegen ECHTES Postgres (T-14). Prüft den Mahnlauf auf DB-Ebene:
// überfälliger Posten → Mahnstufe hochgesetzt; Mahnsperre am Kunden respektiert.
// Distinkter PriceGroup.kind (WIEDERVERKAEUFER) gegen Fixture-Kollisionen. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaDunningRepository } from "./prisma-dunning.repository.js";
import { DunningService } from "../modules/dunning/dunning.service.js";

const PG = "pg_dun";
const CO = "co_dun"; // zahlend
const CO_BLOCK = "co_dun_block"; // Mahnsperre
const ORD = "order_dun";
const ORD_B = "order_dun_block";
const INV = "inv_dun";
const INV_B = "inv_dun_block";
const OI = "oi_dun";
const OI_B = "oi_dun_block";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaDunningRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaDunningRepository — Mahnlauf gegen echtes Postgres", () => {
    const repo = new PrismaDunningRepository();
    const service = new DunningService(repo, new MemoryAuditSink());

    async function cleanup() {
      await prisma.openItem.deleteMany({ where: { id: { in: [OI, OI_B] } } });
      await prisma.invoice.deleteMany({ where: { id: { in: [INV, INV_B] } } });
      await prisma.order.deleteMany({ where: { id: { in: [ORD, ORD_B] } } });
      await prisma.company.deleteMany({ where: { id: { in: [CO, CO_BLOCK] } } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "WIEDERVERKAEUFER", name: "WV" } });
      await prisma.company.create({ data: { id: CO, name: "Zahlt GmbH", priceGroupId: PG } });
      await prisma.company.create({ data: { id: CO_BLOCK, name: "Gesperrt GmbH", priceGroupId: PG, mahnsperre: true } });
      await prisma.order.create({ data: { id: ORD, number: "AB-DUN-1", companyId: CO } });
      await prisma.order.create({ data: { id: ORD_B, number: "AB-DUN-2", companyId: CO_BLOCK } });
      await prisma.invoice.create({ data: { id: INV, number: "RD-1", orderId: ORD, companyId: CO, netCents: 5000, taxCents: 950, grossCents: 5950 } });
      await prisma.invoice.create({ data: { id: INV_B, number: "RD-2", orderId: ORD_B, companyId: CO_BLOCK, netCents: 5000, taxCents: 950, grossCents: 5950 } });
      await prisma.openItem.create({ data: { id: OI, invoiceId: INV, openCents: 5950, dueDate: new Date(Date.UTC(2026, 4, 1)) } });
      await prisma.openItem.create({ data: { id: OI_B, invoiceId: INV_B, openCents: 5950, dueDate: new Date(Date.UTC(2026, 4, 1)) } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("mahnt den zahlenden Kunden (Stufe 1) und überspringt den gesperrten", async () => {
      const run = await service.runDunning(new Date(Date.UTC(2026, 5, 15)));
      expect(run.proposals.map((p) => p.itemId)).toEqual([OI]);
      expect(run.blocked).toEqual([OI_B]);

      expect((await prisma.openItem.findUnique({ where: { id: OI } }))?.dunningLevel).toBe(1);
      expect((await prisma.openItem.findUnique({ where: { id: OI_B } }))?.dunningLevel).toBe(0);
    });
  });
}
