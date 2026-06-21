// Schnittstellen der Worker-Orchestrierung (Kap. 13/32). Transport-/DB-frei —
// konkrete Stores (Prisma) und Queue (BullMQ) liegen im Worker-Laufzeitpaket.

export type OutboxStatus = "PENDING" | "SENT" | "FAILED" | "DEAD";

export interface OutboxRecord {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
}

export interface EnqueueInput {
  type: string;
  payload: unknown;
  aggregateType?: string;
  aggregateId?: string;
}

export interface OutboxStore {
  enqueue(input: EnqueueInput): Promise<OutboxRecord>;
  /** PENDING/FAILED-Events mit nextAttemptAt ≤ now (max. `limit`). */
  claimDue(now: Date, limit: number): Promise<OutboxRecord[]>;
  markSent(id: string): Promise<void>;
  /** Erhöht attempts, setzt FAILED + nextAttemptAt. */
  markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  markDead(id: string, error: string): Promise<void>;
}

export type IntegrationDirection = "INBOUND" | "OUTBOUND";
export type IntegrationStatus = "SUCCESS" | "FAILURE";

export interface IntegrationLogEntry {
  connector: string;
  direction: IntegrationDirection;
  operation: string;
  status: IntegrationStatus;
  attempt: number;
  shopConnectorId?: string | null;
  error?: string | null;
  durationMs?: number | null;
}

export interface IntegrationLogStore {
  record(entry: IntegrationLogEntry): Promise<void>;
}

/** Verarbeitet ein Outbox-Event (routet i. d. R. nach record.type). */
export type Dispatcher = (record: OutboxRecord) => Promise<void>;
