import { describe, expect, it } from "vitest";
import { backoffMs, createRetryPolicy, DEFAULT_RETRY_POLICY, shouldRetry } from "./retry.js";

describe("retry — Backoff-Politik", () => {
  it("wächst exponentiell und wird gedeckelt", () => {
    const o = { baseMs: 1000, factor: 2, maxMs: 8000 };
    expect(backoffMs(1, o)).toBe(1000);
    expect(backoffMs(2, o)).toBe(2000);
    expect(backoffMs(3, o)).toBe(4000);
    expect(backoffMs(4, o)).toBe(8000);
    expect(backoffMs(5, o)).toBe(8000); // Deckel
  });

  it("Full-Jitter nutzt die injizierte Zufallsquelle und bleibt ≤ Deckel", () => {
    const v = backoffMs(3, { baseMs: 1000, maxMs: 8000, jitter: true, random: () => 0.5 });
    expect(v).toBe(2000); // 0.5 * min(8000, 4000)
  });

  it("shouldRetry respektiert maxAttempts", () => {
    const p = createRetryPolicy(3);
    expect(shouldRetry(1, p)).toBe(true);
    expect(shouldRetry(2, p)).toBe(true);
    expect(shouldRetry(3, p)).toBe(false);
  });

  it("Default-Politik: 5 Versuche", () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(5);
  });
});
