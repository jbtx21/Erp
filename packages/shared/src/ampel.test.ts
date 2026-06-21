import { describe, expect, it } from "vitest";
import {
  buildAmpelOverview,
  computeAmpel,
  escalationLevel,
  summarizeAmpel,
  warnDaysFor,
  type AmpelConfig,
  type TrackedProcess,
} from "./ampel.js";

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

describe("Ampel-Tiefe: ebenenspezifische Schwellen, Eskalation, Summary (Kap. 35.4)", () => {
  const cfg: AmpelConfig = { warnDays: 3, warnDaysByLevel: { VEREDLER: 7 }, eskalationDays: 3 };

  it("nutzt ebenenspezifische Warnschwellen", () => {
    expect(warnDaysFor("VEREDLER", cfg)).toBe(7);
    expect(warnDaysFor("AUFTRAG", cfg)).toBe(3);
    // 5 Tage Restlaufzeit: für VEREDLER (Schwelle 7) bereits GELB, für AUFTRAG noch GRÜN.
    expect(computeAmpel(inDays(5), today, false, cfg, "VEREDLER")).toBe("GELB");
    expect(computeAmpel(inDays(5), today, false, cfg, "AUFTRAG")).toBe("GRUEN");
  });

  it("stuft die Eskalation nach Überfälligkeit (0/1/2)", () => {
    expect(escalationLevel(inDays(1), today, false, cfg)).toBe(0);
    expect(escalationLevel(inDays(-2), today, false, cfg)).toBe(1);
    expect(escalationLevel(inDays(-5), today, false, cfg)).toBe(2); // > eskalationDays
    expect(escalationLevel(inDays(-5), today, true, cfg)).toBe(0); // erledigt
  });

  it("sortiert kritisch Überfällige vor einfach Überfällige", () => {
    const procs: TrackedProcess[] = [
      { id: "spät", level: "AUFTRAG", label: "spät", dueDate: inDays(-1), done: false },
      { id: "kritisch", level: "PRODUKTION", label: "kritisch", dueDate: inDays(-9), done: false },
    ];
    const rows = buildAmpelOverview(procs, today, cfg);
    expect(rows.map((r) => r.id)).toEqual(["kritisch", "spät"]);
    expect(rows[0]).toMatchObject({ escalation: 2, overdueDays: 9 });
  });

  it("verdichtet die Übersicht zu Dashboard-Kennzahlen", () => {
    const procs: TrackedProcess[] = [
      { id: "a", level: "AUFTRAG", label: "A", dueDate: inDays(-9), done: false },
      { id: "b", level: "VEREDLER", label: "B", dueDate: inDays(1), done: false },
      { id: "c", level: "PRODUKTION", label: "C", dueDate: inDays(20), done: false },
      { id: "d", level: "AUFTRAG", label: "D", dueDate: inDays(-1), done: true },
    ];
    const sum = summarizeAmpel(buildAmpelOverview(procs, today, cfg));
    expect(sum).toMatchObject({ total: 4, rot: 1, gelb: 1, gruen: 2, overdue: 1, kritisch: 1 });
    expect(sum.mostUrgent?.id).toBe("a");
    expect(sum.byLevel.AUFTRAG).toEqual({ rot: 1, gelb: 0, gruen: 1 });
  });
});
