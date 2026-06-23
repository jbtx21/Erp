import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./rate-limit.js";

describe("FixedWindowRateLimiter", () => {
  it("lässt bis zur Obergrenze zu, dann blockiert es", () => {
    let t = 0;
    const rl = new FixedWindowRateLimiter(3, 60_000, () => t);
    expect(rl.check("a").allowed).toBe(true); // 1
    expect(rl.check("a").allowed).toBe(true); // 2
    expect(rl.check("a")).toMatchObject({ allowed: true, remaining: 0 }); // 3
    expect(rl.check("a").allowed).toBe(false); // 4 → blockiert
  });

  it("Schlüssel sind unabhängig", () => {
    let t = 0;
    const rl = new FixedWindowRateLimiter(1, 60_000, () => t);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
    expect(rl.check("b").allowed).toBe(true);
  });

  it("neues Zeitfenster erlaubt wieder Versuche", () => {
    let t = 0;
    const rl = new FixedWindowRateLimiter(1, 1000, () => t);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
    t = 1000;
    expect(rl.check("a").allowed).toBe(true);
  });

  it("reset() löscht den Zähler (z. B. nach erfolgreichem Login)", () => {
    let t = 0;
    const rl = new FixedWindowRateLimiter(1, 60_000, () => t);
    rl.check("a");
    rl.reset("a");
    expect(rl.check("a").allowed).toBe(true);
  });

  it("retryAfterSec gibt die Restzeit des Fensters an", () => {
    let t = 0;
    const rl = new FixedWindowRateLimiter(1, 60_000, () => t);
    rl.check("a");
    t = 20_000;
    expect(rl.check("a").retryAfterSec).toBe(40);
  });
});
