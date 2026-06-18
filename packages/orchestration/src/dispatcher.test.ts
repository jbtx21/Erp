import { describe, expect, it, vi } from "vitest";
import { createDispatcher, UnknownOutboxTypeError } from "./dispatcher.js";
import type { OutboxRecord } from "./types.js";

const rec = (type: string): OutboxRecord => ({ id: "e1", type, payload: { a: 1 }, attempts: 0 });

describe("createDispatcher (Kap. 32)", () => {
  it("routet ein Event an den Handler seines Typs", async () => {
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    const dispatch = createDispatcher({ "order.status.update": a, "shop.price.push": b });

    await dispatch(rec("order.status.update"));

    expect(a).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0]?.[0]).toMatchObject({ type: "order.status.update" });
    expect(b).not.toHaveBeenCalled();
  });

  it("wirft bei unbekanntem Typ (Relay verbucht Retry/DEAD)", async () => {
    const dispatch = createDispatcher({});
    await expect(dispatch(rec("nope"))).rejects.toBeInstanceOf(UnknownOutboxTypeError);
  });
});
