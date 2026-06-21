// Integrationstest gegen echtes Redis: ein eingereihter Job lässt den BullMQ-Worker
// einen Outbox-Relay-Tick ausführen. Opt-in via RUN_REDIS_TESTS=1, sonst Skip.
import { createRetryPolicy } from "@texma/shared";
import {
  InMemoryIntegrationLogStore,
  InMemoryOutboxStore,
  OutboxRelay,
} from "@texma/orchestration";
import { QueueEvents } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutboxQueue, createOutboxWorker } from "./scheduler.js";

const enabled = process.env.RUN_REDIS_TESTS === "1";
const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
};

if (!enabled) {
  describe.skip("BullMQ Outbox-Worker (übersprungen: RUN_REDIS_TESTS!=1)", () => {
    it("benötigt Redis", () => expect(true).toBe(true));
  });
} else {
  describe("BullMQ Outbox-Worker gegen echtes Redis", () => {
    const store = new InMemoryOutboxStore();
    const log = new InMemoryIntegrationLogStore();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const relay = new OutboxRelay(store, dispatch, log, createRetryPolicy(3));
    const queue = createOutboxQueue(connection);
    const worker = createOutboxWorker(connection, relay);
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

    it("verarbeitet ein eingereihtes Event über die Queue (Tick → SENT)", async () => {
      await store.enqueue({ type: "shop.price.push", payload: { sku: "X" } });
      const job = await queue.add("tick", {});
      const result = await job.waitUntilFinished(events, 10_000);

      expect(result).toMatchObject({ sent: 1 });
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(store.events[0]?.status).toBe("SENT");
      expect(log.entries[0]).toMatchObject({ connector: "outbox", status: "SUCCESS" });
    });
  });
}
