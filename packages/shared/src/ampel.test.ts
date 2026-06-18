import { describe, expect, it } from "vitest";
import { buildAmpelOverview, computeAmpel, type TrackedProcess } from "./ampel.js";

const today = new Date("2026-06-18T00:00:00Z");
const inDays = (d: number) =>
  new Date(today.getTime() + d * 24 * 60 * 60 * 1000);

describe("Ampel (Kap. 35.4)", () => {
  it("überfällig → ROT, knapp → GELB, sonst GRÜN", () => {
    expect(computeAmpel(inDays(-1), today)).toBe("ROT");
    expect(computeAmpel(inDays(2), today)).toBe("GELB");
    expect(computeAmpel(inDays(10), today)).toBe("GRUEN");
  });

  it("erledigte Vorgänge sind immer GRÜN", () => {
    expect(computeAmpel(inDays(-5), today, true)).toBe("GRUEN");
  });

  it("sortiert die Übersicht nach Dringlichkeit (ROT zuerst)", () => {
    const procs: TrackedProcess[] = [
      { id: "a", level: "AUFTRAG", label: "A", dueDate: inDays(10), done: false },
      { id: "b", level: "PRODUKTION", label: "B", dueDate: inDays(-2), done: false },
      { id: "c", level: "VEREDLER", label: "C", dueDate: inDays(1), done: false },
    ];
    const rows = buildAmpelOverview(procs, today);
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(rows[0]?.ampel).toBe("ROT");
  });
});
