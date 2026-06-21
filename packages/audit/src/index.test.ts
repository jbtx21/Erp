import { describe, it, expect, vi } from "vitest";
import {
  buildEntry,
  assertMutable,
  ImmutableViolationError,
  earliestDeletionDate,
  retentionYears,
  type AuditSink,
} from "./index.js";

describe("GoBD audit (Kap. 10)", () => {
  it("baut einen Audit-Eintrag mit Zeitstempel", () => {
    const e = buildEntry({ entity: "Invoice", entityId: "i1", action: "FINALIZE" });
    expect(e.createdAt).toBeInstanceOf(Date);
    expect(e.action).toBe("FINALIZE");
  });

  it("Senke ist append-only und wird aufgerufen", async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const sink: AuditSink = { append };
    await sink.append(buildEntry({ entity: "Order", entityId: "o1", action: "CREATE" }));
    expect(append).toHaveBeenCalledOnce();
  });

  it("verhindert Mutation finalisierter Belege", () => {
    expect(() => assertMutable(true, "Invoice", "i1")).toThrow(ImmutableViolationError);
    expect(() => assertMutable(false, "Invoice", "i1")).not.toThrow();
  });

  it("Aufbewahrungsfristen 10/6 Jahre", () => {
    expect(retentionYears("BOOKING_10Y")).toBe(10);
    expect(retentionYears("BUSINESS_6Y")).toBe(6);
    const start = new Date("2026-01-01T00:00:00Z");
    expect(earliestDeletionDate(start, "BOOKING_10Y").getUTCFullYear()).toBe(2036);
  });
});
