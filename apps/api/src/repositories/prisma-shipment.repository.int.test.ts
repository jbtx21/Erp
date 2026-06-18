// Integrationstest gegen ECHTES Postgres (C4/T-06). Prüft den Versand-Rückkanal auf
// Datenbankebene: listShippable findet versandbereite Aufträge mit Lieferadresse;
// confirmShipped setzt VERSENDET + Trackingnummer und reiht das Outbox-Event ein.
// Nur mit RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaShipmentRepository } from "./prisma-shipment.repository.js";
import { ShipmentService } from "../modules/shipment/shipment.service.js";

const PG = "pg_ship_standard";
const CO = "co_ship_acme";
const SC = "sc_ship_acme";
const DA = "da_ship_acme";
const ORD = "order_ship_int";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaShipmentRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres (RUN_DB_TESTS=1 + DATABASE_URL)", () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe("PrismaShipmentRepository — Versand-Rückkanal gegen echtes Postgres", () => {
    const repo = new PrismaShipmentRepository();
    const service = new ShipmentService(repo, new MemoryAuditSink());

    async function cleanup() {
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: ORD } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.deliveryAddress.deleteMany({ where: { id: DA } });
      await prisma.shopConnector.deleteMany({ where: { id: SC } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.shopConnector.create({
        data: { id: SC, name: "ACME Shop", baseUrl: "https://acme.example", companyId: CO },
      });
      await prisma.deliveryAddress.create({
        data: { id: DA, companyId: CO, label: "HQ", street: "Hauptstr. 1", zip: "71083", city: "Herrenberg", country: "DE" },
      });
      await prisma.order.create({
        data: {
          id: ORD,
          number: "WC-SHIP-1",
          externalNumber: "500",
          companyId: CO,
          shopConnectorId: SC,
          deliveryAddressId: DA,
          status: "VERSANDBEREIT",
        },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("listet den versandbereiten Auftrag und bestätigt den Versand inkl. Outbox-Event", async () => {
      const shippable = await service.listShippable(50);
      expect(shippable.find((o) => o.id === ORD)).toMatchObject({
        recipient: { name: "ACME GmbH", city: "Herrenberg" },
      });

      const res = await service.confirmShipped({ orderId: ORD, trackingNumber: "DPD123" });
      expect(res).toMatchObject({ orderId: ORD, externalNumber: "500", trackingNumber: "DPD123" });

      const order = await prisma.order.findUnique({ where: { id: ORD } });
      expect(order).toMatchObject({ status: "VERSENDET", trackingNumber: "DPD123" });

      const event = await prisma.outboxEvent.findFirst({ where: { aggregateId: ORD, type: "order.status.update" } });
      expect(event?.payload).toMatchObject({ status: "VERSENDET", trackingNumber: "DPD123", externalNumber: "500" });

      // Nach Versand nicht mehr versandbereit.
      const after = await service.listShippable(50);
      expect(after.find((o) => o.id === ORD)).toBeUndefined();
    });
  });
}
