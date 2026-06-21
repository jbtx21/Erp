import { createRetryPolicy } from "@texma/shared";
import { describe, expect, it, vi } from "vitest";
import { InMemoryIntegrationLogStore, InMemoryOutboxStore } from "./in-memory.js";
import { OutboxRelay } from "./outbox-relay.js";

function setup(dispatch: ReturnType<typeof vi.fn>, maxAttempts = 3) {
  const store = new InMemoryOutboxStore();
  const log = new InMemoryIntegrationLogStore();
  let now = new Date("2026-06-18T10:00:00Z");
  const policy = createRetryPolicy(maxAttempts, { baseMs: 1000, jitter: false });
  const relay = new OutboxRelay(store, dispatch, log, policy, () => now);
  return { store, log, relay, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe("OutboxRelay", () => {
  it("dispatcht ein fälliges Event und markiert es SENT + IntegrationLog SUCCESS", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const { store, log, relay } = setup(dispatch);
    await store.enqueue({ type: "shop.price.push", payload: { sku: "X" } });

    const res = await relay.tick();

    expect(res).toEqual({ sent: 1, retried: 0, dead: 0 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(store.events[0]?.status).toBe("SENT");
    expect(log.entries[0]).toMatchObject({ connector: "outbox", operation: "shop.price.push", status: "SUCCESS", attempt: 1 });
  });

  it("verschiebt bei Fehler mit Backoff und eskaliert nach maxAttempts zu DEAD", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("boom"));
    const { store, log, relay, advance } = setup(dispatch, 2);
    await store.enqueue({ type: "shop.status.push", payload: {} });

    const t1 = await relay.tick();
    expect(t1).toEqual({ sent: 0, retried: 1, dead: 0 });
    expect(store.events[0]?.status).toBe("FAILED");
    expect(store.events[0]?.attempts).toBe(1);

    // vor Ablauf des Backoffs nicht fällig
    expect(await relay.tick()).toEqual({ sent: 0, retried: 0, dead: 0 });

    advance(1000); // Backoff (attempt 1 → 1000ms) abgelaufen
    const t2 = await relay.tick();
    expect(t2).toEqual({ sent: 0, retried: 0, dead: 1 });
    expect(store.events[0]?.status).toBe("DEAD");
    expect(log.entries.filter((e) => e.status === "FAILURE")).toHaveLength(2);
  });

  it("ignoriert noch nicht fällige Events", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const { store, relay } = setup(dispatch);
    const evt = await store.enqueue({ type: "x", payload: {} });
    await store.markRetry(evt.id, new Date("2026-06-18T11:00:00Z"), "later"); // in der Zukunft

    expect(await relay.tick()).toEqual({ sent: 0, retried: 0, dead: 0 });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
