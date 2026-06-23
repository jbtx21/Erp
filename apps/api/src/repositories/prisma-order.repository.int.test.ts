// Integrationstest gegen ein ECHTES Postgres (B3). Prüft die T-01-Invariante
// auf Datenbankebene: der Shop-Import bindet Aufträge an die Firma und legt
// KEINE neuen Firmen an. Läuft nur, wenn DATABASE_URL gesetzt ist (sonst skip),
// damit Umgebungen ohne DB (CI ohne Postgres) nicht fehlschlagen.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaOrderRepository } from "./prisma-order.repository.js";
import { OrderImportService } from "../modules/shop-import/order-import.service.js";

const CO = "co_test_acme";
const SC = "sc_test_acme";
const PG = "pg_test_standard";

const woo = (number: string, first: string) => ({
  id: Number(number.replace(/\D/g, "")),
  number,
  status: "processing",
  billing: { first_name: first, last_name: "Test", email: `${first}@acme.de` },
  line_items: [{ name: "T-Shirt / L", quantity: 3, price: "19.90" }],
});

// Opt-in über RUN_DB_TESTS=1 (zusammen mit einer erreichbaren DATABASE_URL).
// `@texma/db` lädt packages/db/.env und setzt DATABASE_URL stets — daher reicht
// dessen Vorhandensein als Gate nicht; wir verlangen ein explizites Flag.
const dbConfigured = process.env.RUN_DB_TESTS === "1";

// Ohne Flag: einen einzelnen übersprungenen Test registrieren und KEINE DB-Hooks
// ausführen (skipIf würde beforeAll trotzdem laufen lassen).
if (!dbConfigured) {
  describe.skip("PrismaOrderRepository — T-01 (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres (RUN_DB_TESTS=1 + DATABASE_URL)", () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe("PrismaOrderRepository — T-01 gegen echtes Postgres", () => {
  const repo = new PrismaOrderRepository();
  const service = new OrderImportService(repo, new MemoryAuditSink());
  const cfg = { shopConnectorId: SC, companyId: CO };

  async function cleanup() {
    await prisma.orderLine.deleteMany({ where: { order: { shopConnectorId: SC } } });
    await prisma.order.deleteMany({ where: { shopConnectorId: SC } });
    await prisma.shopConnector.deleteMany({ where: { id: SC } });
    await prisma.company.deleteMany({ where: { id: CO } });
    await prisma.priceGroup.deleteMany({ where: { id: PG } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.priceGroup.create({
      data: { id: PG, kind: "STANDARD", name: "Standard" },
    });
    await prisma.company.create({
      data: { id: CO, name: "ACME GmbH", priceGroupId: PG },
    });
    await prisma.shopConnector.create({
      data: { id: SC, name: "ACME Shop", baseUrl: "https://acme.example", companyId: CO },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("zwei Bestellungen verschiedener Mitarbeiter → eine Firma, 0 neue Firmen", async () => {
    const companiesBefore = await prisma.company.count();

    const a = await service.importWooOrder(woo("WC-1", "max"), cfg);
    const b = await service.importWooOrder(woo("WC-2", "erika"), cfg);

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(await prisma.company.count()).toBe(companiesBefore); // T-01

    const orders = await prisma.order.findMany({ where: { shopConnectorId: SC } });
    expect(orders).toHaveLength(2);
    expect(orders.every((o) => o.companyId === CO)).toBe(true);
    expect(orders.map((o) => o.employeeNote).sort()).toEqual([
      "erika Test <erika@acme.de>",
      "max Test <max@acme.de>",
    ]);
  });

  it("ist idempotent: gleiche externe Bestellnummer legt nicht doppelt an", async () => {
    const first = await service.importWooOrder(woo("WC-3", "max"), cfg);
    const again = await service.importWooOrder(woo("WC-3", "max"), cfg);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.order.id).toBe(first.order.id);
    expect(await prisma.order.count({ where: { shopConnectorId: SC, externalNumber: "WC-3" } })).toBe(1);
  });
  });
}
