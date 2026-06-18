// Integrationstest gegen echtes Redis: ein eingereihter Connector-Job lässt den
// BullMQ-Worker den injizierten Runner genau einmal ausführen (C2). Opt-in via
// RUN_REDIS_TESTS=1, sonst Skip.
import { QueueEvents } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createConnectorQueue, createConnectorWorker } from "./scheduler.js";

const enabled = process.env.RUN_REDIS_TESTS === "1";
const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
};

if (!enabled) {
  describe.skip("BullMQ Connector-Worker (übersprungen: RUN_REDIS_TESTS!=1)", () => {
    it("benötigt Redis", () => expect(true).toBe(true));
  });
} else {
  describe("BullMQ Connector-Worker gegen echtes Redis", () => {
    const supplierSync = vi.fn().mockResolvedValue({ ok: true });
    const queue = createConnectorQueue(connection);
    const worker = createConnectorWorker(connection, { "supplier.sync": supplierSync });
    const events = new QueueEvents(queue.name, { connection });

    beforeAll(async () => {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await worker.waitUntilReady();
      await events.waitUntilReady();
    });

    afterAll(async () => {
      await worker.close();
      await events.close();
      await queue.close();
    });

    it("führt den Runner des Job-Namens genau einmal aus", async () => {
      const job = await queue.add("supplier.sync", {});
      const result = await job.waitUntilFinished(events, 10_000);

      expect(result).toMatchObject({ ok: true });
      expect(supplierSync).toHaveBeenCalledTimes(1);
    });
  });
}
