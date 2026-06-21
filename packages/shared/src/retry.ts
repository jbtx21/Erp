// Reine Retry-/Backoff-Politik (Kap. 13/32). Exponentiell mit Deckel + optionalem
// Full-Jitter. Keine IO — in Worker-Orchestrierung (Outbox/BullMQ) wiederverwendbar.

export interface RetryPolicy {
  readonly maxAttempts: number;
  /** Wartezeit (ms) vor dem `attempt`-ten Versuch (attempt ≥ 1). */
  backoffMs(attempt: number): number;
}

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  /** Full-Jitter über injizierbare Zufallsquelle (Test-stabil). */
  jitter?: boolean;
  random?: () => number;
}

/** Exponentielles Backoff: base * factor^(attempt-1), gedeckelt bei maxMs. */
export function backoffMs(attempt: number, opts: BackoffOptions = {}): number {
  const { baseMs = 1_000, maxMs = 60_000, factor = 2, jitter = false, random = Math.random } = opts;
  const exp = baseMs * Math.pow(factor, Math.max(0, attempt - 1));
  const capped = Math.min(maxMs, exp);
  return jitter ? Math.floor(random() * capped) : capped;
}

export function createRetryPolicy(maxAttempts: number, opts: BackoffOptions = {}): RetryPolicy {
  return { maxAttempts, backoffMs: (attempt) => backoffMs(attempt, opts) };
}

/** Standardpolitik: 5 Versuche, 1s→60s exponentiell. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = createRetryPolicy(5);

export function shouldRetry(attempt: number, policy: RetryPolicy): boolean {
  return attempt < policy.maxAttempts;
}
