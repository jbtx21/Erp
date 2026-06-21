// Integrationstest gegen ECHTES Postgres (B13). Mandanten-Isolation: ein Kunde sieht
// AUSSCHLIESSLICH die Aufträge der eigenen Firma. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { PrismaPortalRepository } from "./prisma-portal.repository.js";
import { CustomerPortalService } from "../modules/portal/portal.service.js";

const PG = "pg_b13";
const CO_A = "co_b13_a";
const CO_B = "co_b13_b";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaPortalRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaPortalRepository — Kundenportal-Mandantenisolation gegen echtes Postgres", () => {
    const service = new CustomerPortalService(new PrismaPortalRepository());

    async function cleanup() {
      await prisma.order.deleteMany({ where: { companyId: { in: [CO_A, CO_B] } } });
      await prisma.company.deleteMany({ where: { id: { in: [CO_A, CO_B] } } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO_A, name: "Kunde A", priceGroupId: PG } });
      await prisma.company.create({ data: { id: CO_B, name: "Kunde B", priceGroupId: PG } });
      await prisma.order.create({ data: { number: "AB-B13-A1", companyId: CO_A, status: "IN_PRODUKTION", trackingNumber: "DPD-1" } });
      await prisma.order.create({ data: { number: "AB-B13-A2", companyId: CO_A, status: "VERSENDET" } });
      await prisma.order.create({ data: { number: "AB-B13-B1", companyId: CO_B, status: "ANGELEGT" } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("liefert nur die Aufträge der eigenen Firma (read-only)", async () => {
      const a = await service.myOrders(CO_A);
      expect(a.map((o) => o.number).sort()).toEqual(["AB-B13-A1", "AB-B13-A2"]);
      expect(a.find((o) => o.number === "AB-B13-A1")).toMatchObject({ status: "IN_PRODUKTION", trackingNumber: "DPD-1" });

      const b = await service.myOrders(CO_B);
      expect(b.map((o) => o.number)).toEqual(["AB-B13-B1"]);
      // Keine Überschneidung: B sieht keinen A-Auftrag.
      expect(b.some((o) => o.number.startsWith("AB-B13-A"))).toBe(false);
    });

    it("verlangt einen Kunden-Scope", async () => {
      await expect(service.myOrders("")).rejects.toThrow();
    });
  });
}
