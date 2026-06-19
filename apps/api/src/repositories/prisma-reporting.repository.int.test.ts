// Integrationstest gegen ECHTES Postgres (Kap. 29). Prüft, dass die Reporting-
// Datenpunkte korrekt aus finalisierten Rechnungen (Umsatz) und Aufträgen (Anzahl +
// Auftragswert) gelesen und über den Service zu Perioden-Eimern aggregiert werden.
// Distinkter PriceGroup.kind (WIEDERVERKAEUFER). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { ReportingService } from "../modules/reporting/reporting.service.js";
import { PrismaReportingRepository } from "./prisma-reporting.repository.js";

const PG = "pg_rep";
const CO = "co_rep";
const ORD_A = "order_rep_a";
const ORD_B = "order_rep_b";
const INV_A = "inv_rep_a";
const INV_B = "inv_rep_b";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaReportingRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaReportingRepository — Auswertungen gegen echtes Postgres", () => {
    const service = new ReportingService(new PrismaReportingRepository());

    async function cleanup() {
      await prisma.invoice.deleteMany({ where: { id: { in: [INV_A, INV_B] } } });
      await prisma.orderLine.deleteMany({ where: { order: { id: { in: [ORD_A, ORD_B] } } } });
      await prisma.order.deleteMany({ where: { id: { in: [ORD_A, ORD_B] } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "WIEDERVERKAEUFER", name: "Wiederverkäufer" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });

      // Zwei Aufträge in unterschiedlichen Monaten, je mit Positionen.
      await prisma.order.create({
        data: {
          id: ORD_A,
          number: "AB-REP-1",
          companyId: CO,
          createdAt: new Date(Date.UTC(2026, 4, 10)), // Mai
          lines: { create: [{ position: 1, description: "Polo", qty: 10, unitNetCents: 2_000 }] },
        },
      });
      await prisma.order.create({
        data: {
          id: ORD_B,
          number: "AB-REP-2",
          companyId: CO,
          createdAt: new Date(Date.UTC(2026, 5, 5)), // Juni
          lines: { create: [{ position: 1, description: "Shirt", qty: 5, unitNetCents: 3_000 }] },
        },
      });

      // Finalisierte Rechnungen je Auftrag.
      await prisma.invoice.create({
        data: {
          id: INV_A,
          number: "RE-REP-1",
          orderId: ORD_A,
          companyId: CO,
          netCents: 20_000,
          taxCents: 3_800,
          grossCents: 23_800,
          issuedAt: new Date(Date.UTC(2026, 4, 11)), // Mai
          finalized: true,
        },
      });
      await prisma.invoice.create({
        data: {
          id: INV_B,
          number: "RE-REP-2",
          orderId: ORD_B,
          companyId: CO,
          netCents: 15_000,
          taxCents: 2_850,
          grossCents: 17_850,
          issuedAt: new Date(Date.UTC(2026, 5, 6)), // Juni
          finalized: true,
        },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("aggregiert den Umsatz je Monat aus finalisierten Rechnungen", async () => {
      const res = await service.revenueOverview("MONTH");
      const byKey = new Map(res.buckets.map((b) => [b.key, b]));
      expect(byKey.get("2026-05")?.netCents).toBe(20_000);
      expect(byKey.get("2026-06")?.netCents).toBe(15_000);
    });

    it("aggregiert die Aufträge je Monat (Anzahl + Auftragswert)", async () => {
      const res = await service.orderOverview("MONTH");
      const byKey = new Map(res.buckets.map((b) => [b.key, b]));
      expect(byKey.get("2026-05")).toMatchObject({ count: 1, netCents: 20_000 });
      expect(byKey.get("2026-06")).toMatchObject({ count: 1, netCents: 15_000 });
    });

    it("vergleicht Juni gegen Mai über den Service", async () => {
      const cmp = await service.compareRevenue("MONTH", new Date(Date.UTC(2026, 5, 15)));
      expect(cmp.current.netCents).toBe(15_000);
      expect(cmp.previous?.netCents).toBe(20_000);
      expect(cmp.deltaCents).toBe(-5_000);
    });
  });
}
