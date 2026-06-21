// Integrationstest gegen ECHTES Postgres (B9). Rückwärtsterminierung: Start =
// Liefertermin − Summe der Veredelungs-Durchlaufzeiten. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { addDays } from "@texma/shared";
import { PrismaSchedulingRepository } from "./prisma-scheduling.repository.js";
import { SchedulingService } from "../modules/scheduling/scheduling.service.js";

const PG = "pg_b9";
const CO = "co_b9";
const ORD = "ord_b9";
const ORD_NODATE = "ord_b9_nodate";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaSchedulingRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaSchedulingRepository — Rückwärtsterminierung gegen echtes Postgres", () => {
    const service = new SchedulingService(new PrismaSchedulingRepository());
    const delivery = new Date(Date.UTC(2026, 5, 30));

    async function cleanup() {
      await prisma.order.deleteMany({ where: { id: { in: [ORD, ORD_NODATE] } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
      await prisma.finishingTargetTime.deleteMany({ where: { kind: { in: ["TRANSFER", "STICK"] } } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.order.create({ data: { id: ORD, number: "AB-B9-1", companyId: CO, zugesagterLiefertermin: delivery } });
      await prisma.order.create({ data: { id: ORD_NODATE, number: "AB-B9-2", companyId: CO } });
      // 480 min → 1 Tag, 960 min → 2 Tage ⇒ Summe 3 Tage.
      await prisma.finishingTargetTime.create({ data: { kind: "TRANSFER", targetMinutes: 480, basis: "STUECK" } });
      await prisma.finishingTargetTime.create({ data: { kind: "STICK", targetMinutes: 960, basis: "STUECK" } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("Start = Liefertermin − 3 Tage; letzte Stufe endet am Liefertermin", async () => {
      const plan = await service.planOrder(ORD);
      expect(plan).not.toBeNull();
      expect(plan!.start).toEqual(addDays(delivery, -3));
      expect(plan!.stages.at(-1)!.end).toEqual(delivery);
      expect(plan!.stages).toHaveLength(2);
    });

    it("ohne zugesagten Liefertermin keine Terminierung", async () => {
      expect(await service.planOrder(ORD_NODATE)).toBeNull();
    });
  });
}
