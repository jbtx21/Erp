import { describe, expect, it } from "vitest";
import {
  allStagesReturned,
  canStartStage,
  canTransition,
  SubProductionTransitionError,
  transitionStage,
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
