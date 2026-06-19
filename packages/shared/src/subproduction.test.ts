import { describe, expect, it } from "vitest";
import {
  allStagesReturned,
  canStartStage,
  canTransition,
  chainYieldPercent,
  isStageOverdue,
  planSubProduction,
  stageScrap,
  SubProductionTransitionError,
  transitionStage,
  validateReturnQty,
  type SubProductionStage,
} from "./subproduction.js";

const t = (s: number, status: SubProductionStage["status"]): SubProductionStage => ({
  sequence: s,
  supplierId: `veredler-${s}`,
  status,
});

describe("Mehrstufige Fremdvergabe (T-04)", () => {
  it("erlaubt nur den linearen Statusfluss", () => {
    expect(canTransition("OFFEN", "BEISTELLUNG_VERSANDT")).toBe(true);
    expect(canTransition("OFFEN", "RUECKLAUF_ERHALTEN")).toBe(false);
    expect(canTransition("ABGESCHLOSSEN", "OFFEN")).toBe(false);
  });

  it("setzt Zeitstempel beim Übergang und bucht den Rücklauf", () => {
    const at1 = new Date("2026-06-01T08:00:00Z");
    const at2 = new Date("2026-06-03T08:00:00Z");
    let stage = t(1, "OFFEN");
    stage = transitionStage(stage, "BEISTELLUNG_VERSANDT", at1);
    expect(stage.beistellungVersandtAm).toEqual(at1);
    stage = transitionStage(stage, "RUECKLAUF_ERHALTEN", at2);
    expect(stage.ruecklaufErhaltenAm).toEqual(at2);
    expect(stage.beistellungVersandtAm).toEqual(at1); // bleibt erhalten
  });

  it("wirft bei unerlaubtem Übergang", () => {
    expect(() => transitionStage(t(1, "OFFEN"), "ABGESCHLOSSEN", new Date())).toThrow(
      SubProductionTransitionError
    );
  });

  it("startet Stufe 2 erst nach Rücklauf von Stufe 1", () => {
    const stages = [t(1, "BEISTELLUNG_VERSANDT"), t(2, "OFFEN")];
    expect(canStartStage(stages, 2)).toBe(false);
    const stages2 = [t(1, "RUECKLAUF_ERHALTEN"), t(2, "OFFEN")];
    expect(canStartStage(stages2, 2)).toBe(true);
  });

  it("erste Stufe darf immer starten", () => {
    expect(canStartStage([t(1, "OFFEN")], 1)).toBe(true);
  });

  it("allStagesReturned erst wenn alle Stufen zurück sind", () => {
    expect(allStagesReturned([t(1, "RUECKLAUF_ERHALTEN"), t(2, "BEISTELLUNG_VERSANDT")])).toBe(
      false
    );
    expect(allStagesReturned([t(1, "RUECKLAUF_ERHALTEN"), t(2, "ABGESCHLOSSEN")])).toBe(true);
  });
});

describe("Fremdvergabe-Tiefe: Mengen/Schwund/Yield/Termine (T-04)", () => {
  const stage = (over: Partial<SubProductionStage>): SubProductionStage => ({
    sequence: 1,
    supplierId: "veredler-1",
    status: "OFFEN",
    ...over,
  });

  it("validiert die Rücklaufmenge gegen die Beistellmenge", () => {
    expect(() => validateReturnQty(100, 90)).not.toThrow();
    expect(() => validateReturnQty(100, 120)).toThrow(SubProductionTransitionError);
    expect(() => validateReturnQty(100, -1)).toThrow(SubProductionTransitionError);
    expect(() => validateReturnQty(null, 50)).not.toThrow(); // ohne Beistellmenge erlaubt
  });

  it("berechnet den Schwund je Stufe", () => {
    expect(stageScrap(stage({ beistellMenge: 100, ruecklaufMenge: 92 }))).toBe(8);
    expect(stageScrap(stage({ beistellMenge: 100 }))).toBeNull();
  });

  it("berechnet die Kettenausbeute über die Stufen", () => {
    const stages = [
      stage({ sequence: 1, status: "RUECKLAUF_ERHALTEN", beistellMenge: 100, ruecklaufMenge: 95 }),
      stage({ sequence: 2, status: "RUECKLAUF_ERHALTEN", beistellMenge: 95, ruecklaufMenge: 90 }),
    ];
    expect(chainYieldPercent(stages)).toBe(90); // 90 / 100
  });

  it("erkennt überfällige, noch nicht zurückgemeldete Stufen", () => {
    const now = new Date("2026-06-10T00:00:00Z");
    expect(isStageOverdue(stage({ dueDate: new Date("2026-06-05T00:00:00Z"), status: "BEISTELLUNG_VERSANDT" }), now)).toBe(true);
    expect(isStageOverdue(stage({ dueDate: new Date("2026-06-05T00:00:00Z"), status: "RUECKLAUF_ERHALTEN" }), now)).toBe(false);
    expect(isStageOverdue(stage({ dueDate: new Date("2026-06-20T00:00:00Z"), status: "OFFEN" }), now)).toBe(false);
  });

  it("verdichtet die Stufen zu einem Plan (nächste/blockiert/überfällig/Schwund/Fortschritt)", () => {
    const now = new Date("2026-06-10T00:00:00Z");
    const stages: SubProductionStage[] = [
      stage({ sequence: 1, status: "RUECKLAUF_ERHALTEN", beistellMenge: 100, ruecklaufMenge: 96, lohnCents: 5_000 }),
      stage({ sequence: 2, supplierId: "veredler-2", status: "BEISTELLUNG_VERSANDT", dueDate: new Date("2026-06-05T00:00:00Z"), lohnCents: 7_000 }),
      stage({ sequence: 3, supplierId: "veredler-3", status: "OFFEN" }),
    ];
    const plan = planSubProduction(stages, now);
    expect(plan.nextActionable?.sequence).toBe(2);
    expect(plan.blocked.map((s) => s.sequence)).toEqual([3]); // wartet auf Stufe 2
    expect(plan.overdue.map((s) => s.sequence)).toEqual([2]);
    expect(plan.totalScrap).toBe(4);
    expect(plan.totalLohnCents).toBe(12_000);
    expect(plan.progressPercent).toBe(33); // 1 von 3 zurück
    expect(plan.allReturned).toBe(false);
  });
});
