// Prisma-Implementierungen der Orchestrierungs-Stores (Produktionspfad).
import { prisma } from "@texma/db";
import type {
  EnqueueInput,
  IntegrationLogEntry,
  IntegrationLogStore,
  OutboxRecord,
  OutboxStore,
} from "@texma/orchestration";

export class PrismaOutboxStore implements OutboxStore {
  async enqueue(input: EnqueueInput): Promise<OutboxRecord> {
    const e = await prisma.outboxEvent.create({
      data: {
        type: input.type,
        aggregateType: input.aggregateType ?? null,
        aggregateId: input.aggregateId ?? null,
        payload: input.payload as object,
      },
      select: { id: true, type: true, payload: true, attempts: true },
    });
    return { id: e.id, type: e.type, payload: e.payload, attempts: e.attempts };
  }

  async claimDue(now: Date, limit: number): Promise<OutboxRecord[]> {
    const rows = await prisma.outboxEvent.findMany({
      where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
      select: { id: true, type: true, payload: true, attempts: true },
    });
    return rows.map((r) => ({ id: r.id, type: r.type, payload: r.payload, attempts: r.attempts }));
  }

  async markSent(id: string): Promise<void> {
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), lastError: null },
    });
  }

  async markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void> {
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: "FAILED", attempts: { increment: 1 }, nextAttemptAt, lastError: error },
    });
  }

  async markDead(id: string, error: string): Promise<void> {
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: "DEAD", attempts: { increment: 1 }, lastError: error },
    });
  }
}

export class PrismaIntegrationLogStore implements IntegrationLogStore {
  async record(entry: IntegrationLogEntry): Promise<void> {
    await prisma.integrationLog.create({
      data: {
        connector: entry.connector,
        direction: entry.direction,
        operation: entry.operation,
        status: entry.status,
        attempt: entry.attempt,
        shopConnectorId: entry.shopConnectorId ?? null,
        error: entry.error ?? null,
        durationMs: entry.durationMs ?? null,
      },
    });
  }
}
