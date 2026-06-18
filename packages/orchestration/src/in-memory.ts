// In-Memory-Stores für Tests/lokale Durchstiche (ohne DB).
import type {
  EnqueueInput,
  IntegrationLogEntry,
  IntegrationLogStore,
  OutboxRecord,
  OutboxStatus,
  OutboxStore,
} from "./types.js";

interface StoredEvent extends OutboxRecord {
  status: OutboxStatus;
  nextAttemptAt: Date;
  lastError: string | null;
}

export class InMemoryOutboxStore implements OutboxStore {
  readonly events: StoredEvent[] = [];
  private seq = 0;

  async enqueue(input: EnqueueInput): Promise<OutboxRecord> {
    const event: StoredEvent = {
      id: `evt_${++this.seq}`,
      type: input.type,
      payload: input.payload,
      attempts: 0,
      status: "PENDING",
      nextAttemptAt: new Date(0),
      lastError: null,
    };
    this.events.push(event);
    return this.view(event);
  }

  async claimDue(now: Date, limit: number): Promise<OutboxRecord[]> {
    return this.events
      .filter((e) => (e.status === "PENDING" || e.status === "FAILED") && e.nextAttemptAt <= now)
      .slice(0, limit)
      .map((e) => this.view(e));
  }

  async markSent(id: string): Promise<void> {
    const e = this.find(id);
    if (e) {
      e.status = "SENT";
      e.lastError = null;
    }
  }

  async markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void> {
    const e = this.find(id);
    if (e) {
      e.attempts += 1;
      e.status = "FAILED";
      e.nextAttemptAt = nextAttemptAt;
      e.lastError = error;
    }
  }

  async markDead(id: string, error: string): Promise<void> {
    const e = this.find(id);
    if (e) {
      e.attempts += 1;
      e.status = "DEAD";
      e.lastError = error;
    }
  }

  private find(id: string): StoredEvent | undefined {
    return this.events.find((e) => e.id === id);
  }
  private view(e: StoredEvent): OutboxRecord {
    return { id: e.id, type: e.type, payload: e.payload, attempts: e.attempts };
  }
}

export class InMemoryIntegrationLogStore implements IntegrationLogStore {
  readonly entries: IntegrationLogEntry[] = [];
  async record(entry: IntegrationLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}
