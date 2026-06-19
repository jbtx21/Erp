// Integrationstest gegen ECHTES Postgres (Kap. 29/35). Prüft Durchlaufzeit
// (Auftragsanlage → Lieferschein) und Fehlerquote (Reklamation je Auftrag) über den
// Service. Distinkter PriceGroup.kind (TOP). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { ProductionReportingService } from "../modules/production-reporting/production-reporting.service.js";
import { PrismaProductionReportingRepository } from "./prisma-production-reporting.repository.js";

const PG = "pg_prep";
const CO = "co_prep";
const ORD_A = "order_prep_a";
const ORD_B = "order_prep_b";
const DN_A = "dn_prep_a";
const CMP_B = "cmp_prep_b";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaProductionReportingRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaProductionReportingRepository — Produktions-KPIs gegen echtes Postgres", () => {
    const service = new ProductionReportingService(new PrismaProductionReportingRepository());

    async function cleanup() {
      await prisma.complaint.deleteMany({ where: { id: { in: [CMP_B] } } });
      await prisma.deliveryNote.deleteMany({ where: { id: { in: [DN_A] } } });
      await prisma.orderLine.deleteMany({ where: { order: { id: { in: [ORD_A, ORD_B] } } } });
      await prisma.order.deleteMany({ where: { id: { in: [ORD_A, ORD_B] } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "TOP", name: "Top" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });

      // Auftrag A: versendet, Lieferschein 2 Tage nach Anlage → Durchlaufzeit 48 h.
      await prisma.order.create({
        data: {
          id: ORD_A,
          number: "AB-PREP-1",
          companyId: CO,
          status: "VERSENDET",
          createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, 0)),
        },
      });
      await prisma.deliveryNote.create({
        data: { id: DN_A, number: "LS-PREP-1", orderId: ORD_A, createdAt: new Date(Date.UTC(2026, 5, 3, 0, 0, 0)) },
      });

      // Auftrag B: reklamiert (Ursache INTERN), nicht versendet → keine Durchlaufzeit.
      await prisma.order.create({
        data: {
          id: ORD_B,
          number: "AB-PREP-2",
          companyId: CO,
          status: "IN_PRODUKTION",
          createdAt: new Date(Date.UTC(2026, 5, 5, 0, 0, 0)),
        },
      });
      await prisma.complaint.create({
        data: { id: CMP_B, orderId: ORD_B, orderLineId: "x", cause: "INTERN", costBearer: "TEXMA" },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("ermittelt die Durchlaufzeit aus Anlage → Lieferschein", async () => {
      const res = await service.leadTimeOverview("MONTH");
      const a = res.buckets.find((b) => b.key === "2026-06");
      // Mind. unser versendeter Auftrag A (Durchlaufzeit 48 h) erscheint im Juni.
      expect(a?.count).toBeGreaterThanOrEqual(1);
      expect(res.stats.maxHours).toBeGreaterThanOrEqual(48);
    });

    it("ermittelt die Fehlerquote je Auftrag mit Ursache", async () => {
      const res = await service.defectOverview("MONTH");
      // Mind. die beiden angelegten Aufträge (A ohne, B mit Reklamation).
      expect(res.overall.total).toBeGreaterThanOrEqual(2);
      expect(res.overall.defects).toBeGreaterThanOrEqual(1);
      expect(res.byCause.INTERN).toBeGreaterThanOrEqual(1);
    });
  });
}
