import { describe, expect, it } from "vitest";
import { reconcileStatus, overdueDays, agingBucket, AGING_BUCKETS } from "./payment-reconciliation.js";

describe("reconcileStatus", () => {
  it("ohne Allokation → Klärung", () => {
    expect(reconcileStatus(10000, 0)).toBe("KLAERUNG");
  });
  it("Teilzuordnung → teilzugeordnet", () => {
    expect(reconcileStatus(10000, 6000)).toBe("TEILZUGEORDNET");
  });
  it("voll/überzahlt → zugeordnet", () => {
    expect(reconcileStatus(10000, 10000)).toBe("ZUGEORDNET");
    expect(reconcileStatus(10000, 12000)).toBe("ZUGEORDNET");
  });
});

describe("OP-Aging", () => {
  const asOf = new Date("2026-06-25T00:00:00Z");
  it("zählt Überfälligkeitstage", () => {
    expect(overdueDays(new Date("2026-06-15T00:00:00Z"), asOf)).toBe(10);
    expect(overdueDays(new Date("2026-07-05T00:00:00Z"), asOf)).toBe(-10);
  });
  it("ordnet die Fälligkeitsbänder zu", () => {
    expect(agingBucket(new Date("2026-07-05T00:00:00Z"), asOf)).toBe("NICHT_FAELLIG");
    expect(agingBucket(new Date("2026-06-15T00:00:00Z"), asOf)).toBe("FAELLIG_0_30");
    expect(agingBucket(new Date("2026-05-10T00:00:00Z"), asOf)).toBe("FAELLIG_31_60");
    expect(agingBucket(new Date("2026-04-10T00:00:00Z"), asOf)).toBe("FAELLIG_61_90");
    expect(agingBucket(new Date("2026-01-10T00:00:00Z"), asOf)).toBe("FAELLIG_90_PLUS");
    expect(AGING_BUCKETS).toHaveLength(5);
  });
});
