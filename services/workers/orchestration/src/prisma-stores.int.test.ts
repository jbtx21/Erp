// Integrationstest gegen echtes Postgres: PrismaOutboxStore + PrismaIntegrationLogStore
// (enqueue/claimDue/markSent/markRetry/markDead). Opt-in via RUN_DB_TESTS=1, sonst Skip.
import { prisma } from "@texma/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaIntegrationLogStore, PrismaOutboxStore } from "./prisma-stores.js";

const enabled = process.env.RUN_DB_TESTS === "1";

if (!enabled) {
  describe.skip("Prisma-Orchestrierungs-Stores (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaOutboxStore / PrismaIntegrationLogStore gegen echtes Postgres", () => {
    const outbox = new PrismaOutboxStore();
    const logs = new PrismaIntegrationLogStore();

    beforeEach(async () => {
      await prisma.outboxEvent.deleteMany({});
      await prisma.integrationLog.deleteMany({});
    });
    afterAll(async () => {
      await prisma.outboxEvent.deleteMany({});
      await prisma.integrationLog.deleteMany({});
      await prisma.$disconnect();
    });

    it("enqueue → claimDue → markSent durchläuft den Lebenszyklus", async () => {
      const evt = await outbox.enqueue({ type: "shop.price.push", payload: { sku: "X" } });
      const due = await outbox.claimDue(new Date(), 10);
      expect(due.map((d) => d.id)).toContain(evt.id);

      await outbox.markSent(evt.id);
      expect(await outbox.claimDue(new Date(), 10)).toHaveLength(0);
      const row = await prisma.outboxEvent.findUnique({ where: { id: evt.id } });
      expect(row?.status).toBe("SENT");
      expect(row?.sentAt).not.toBeNull();
    });

    it("markRetry verschiebt in die Zukunft, markDead terminiert", async () => {
      const evt = await outbox.enqueue({ type: "shop.status.push", payload: {} });
      await outbox.markRetry(evt.id, new Date(Date.now() + 3_600_000), "boom");
      expect(await outbox.claimDue(new Date(), 10)).toHaveLength(0); // erst in 1h fällig

      await outbox.markDead(evt.id, "endgültig");
      const row = await prisma.outboxEvent.findUnique({ where: { id: evt.id } });
      expect(row?.status).toBe("DEAD");
      expect(row?.attempts).toBe(2);
    });

    it("IntegrationLog wird persistiert", async () => {
      await logs.record({ connector: "woocommerce", direction: "INBOUND", operation: "poll", status: "SUCCESS", attempt: 1, durationMs: 42 });
      expect(await prisma.integrationLog.count()).toBe(1);
    });
  });
}
