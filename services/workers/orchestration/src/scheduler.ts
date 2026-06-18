// BullMQ-Scheduler (Kap. 13/32): triggert das Outbox-Relay als wiederkehrenden Job
// auf Redis. BullMQ liefert Transport + eigenes Retry; die DURABLE Wahrheit (Status,
// Versuche, Fehler) liegt in OutboxEvent/IntegrationLog.

import { type ConnectionOptions, Queue, Worker } from "bullmq";
import type { OutboxRelay } from "@texma/orchestration";

export const OUTBOX_QUEUE = "outbox-relay";

export function createOutboxQueue(connection: ConnectionOptions): Queue {
  return new Queue(OUTBOX_QUEUE, { connection });
}

/** Worker, der bei jedem Job einen Relay-Tick ausführt. Concurrency 1 → keine Doppelverarbeitung. */
export function createOutboxWorker(connection: ConnectionOptions, relay: OutboxRelay, batch = 50): Worker {
  return new Worker(
    OUTBOX_QUEUE,
    async () => {
      const res = await relay.tick(batch);
      return res;
    },
    { connection, concurrency: 1 }
  );
}

/** Richtet einen wiederkehrenden Tick ein (Standard alle 10 s). */
export async function scheduleOutboxTicks(queue: Queue, everyMs = 10_000): Promise<void> {
  await queue.add("tick", {}, { repeat: { every: everyMs }, removeOnComplete: true, removeOnFail: 100 });
}
