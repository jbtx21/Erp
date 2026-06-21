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

// ─────────────────────────────────────────────────────────────────────────────
// Connector-Polls (Inbound) als wiederkehrende Cron-Jobs (C2). Getrennt vom Outbox-
// Relay (Outbound). Die Runner werden als Handler injiziert — so bleibt dieses Paket
// frei von Connector-Abhängigkeiten (Zyklusvermeidung; Wiring im Laufzeitpaket).
// ─────────────────────────────────────────────────────────────────────────────

export const CONNECTOR_QUEUE = "connector-poll";

/** Job-Name → Runner (z. B. "supplier.sync" → runSupplierSync). */
export type ConnectorHandler = () => Promise<unknown>;

export function createConnectorQueue(connection: ConnectionOptions): Queue {
  return new Queue(CONNECTOR_QUEUE, { connection });
}

/** Worker, der je Job den passenden Connector-Runner ausführt. Concurrency 1. */
export function createConnectorWorker(
  connection: ConnectionOptions,
  handlers: Record<string, ConnectorHandler>
): Worker {
  return new Worker(
    CONNECTOR_QUEUE,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) throw new Error(`Kein Connector-Handler für Job "${job.name}".`);
      return handler();
    },
    { connection, concurrency: 1 }
  );
}

/** Job-Name → Intervall in ms, z. B. `{ "supplier.sync": 3_600_000 }`. */
export type ConnectorSchedule = Record<string, number>;

/** Richtet je Eintrag einen wiederkehrenden Connector-Poll ein. */
export async function scheduleConnectorPolls(
  queue: Queue,
  schedule: ConnectorSchedule
): Promise<void> {
  for (const [jobName, everyMs] of Object.entries(schedule)) {
    await queue.add(jobName, {}, { repeat: { every: everyMs }, removeOnComplete: true, removeOnFail: 100 });
  }
}
