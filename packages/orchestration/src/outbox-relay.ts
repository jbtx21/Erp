// Outbox-Relay (Kap. 32): holt fällige Events, dispatcht sie, schreibt bei Erfolg
// SENT, bei Fehler Retry mit Backoff bzw. DEAD nach erschöpften Versuchen — und
// protokolliert jeden Dispatch im IntegrationLog (Kap. 13). Reine Orchestrierung.

import type { RetryPolicy } from "@texma/shared";
import type { Dispatcher, IntegrationLogStore, OutboxStore } from "./types.js";

export interface TickResult {
  sent: number;
  retried: number;
  dead: number;
}

export class OutboxRelay {
  constructor(
    private readonly store: OutboxStore,
    private readonly dispatch: Dispatcher,
    private readonly log: IntegrationLogStore,
    private readonly policy: RetryPolicy,
    private readonly now: () => Date = () => new Date()
  ) {}

  async tick(limit = 20): Promise<TickResult> {
    const due = await this.store.claimDue(this.now(), limit);
    const result: TickResult = { sent: 0, retried: 0, dead: 0 };

    for (const record of due) {
      const attempt = record.attempts + 1;
      const startedAt = Date.now();
      try {
        await this.dispatch(record);
        await this.store.markSent(record.id);
        await this.record(record.type, "SUCCESS", attempt, null, Date.now() - startedAt);
        result.sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= this.policy.maxAttempts) {
          await this.store.markDead(record.id, message);
          result.dead += 1;
        } else {
          const nextAttemptAt = new Date(this.now().getTime() + this.policy.backoffMs(attempt));
          await this.store.markRetry(record.id, nextAttemptAt, message);
          result.retried += 1;
        }
        await this.record(record.type, "FAILURE", attempt, message, Date.now() - startedAt);
      }
    }

    return result;
  }

  private record(
    operation: string,
    status: "SUCCESS" | "FAILURE",
    attempt: number,
    error: string | null,
    durationMs: number
  ): Promise<void> {
    return this.log.record({
      connector: "outbox",
      direction: "OUTBOUND",
      operation,
      status,
      attempt,
      error,
      durationMs,
    });
  }
}
