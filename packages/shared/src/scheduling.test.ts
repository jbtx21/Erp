import { describe, expect, it } from "vitest";
import { addDays, backwardStart, scheduleBackward, type LeadStage } from "./scheduling.js";

const delivery = new Date(Date.UTC(2026, 5, 30)); // 30.06.2026
const stages: LeadStage[] = [
  { label: "Siebdruck", durationDays: 3 },
  { label: "Stickerei", durationDays: 2 },
];

describe("backwardStart (B9)", () => {
  it("Start = Liefertermin − Summe der Durchlaufzeiten", () => {
    expect(backwardStart(delivery, stages)).toEqual(addDays(delivery, -5));
  });

  it("ohne Stufen = Liefertermin", () => {
    expect(backwardStart(delivery, [])).toEqual(delivery);
  });

  it("negative Durchlaufzeiten zählen als 0", () => {
    expect(backwardStart(delivery, [{ label: "x", durationDays: -4 }])).toEqual(delivery);
  });
});

describe("scheduleBackward (B9)", () => {
  it("verkettet Stufen rückwärts; letzte endet am Liefertermin", () => {
    const plan = scheduleBackward(delivery, stages);
    expect(plan).toHaveLength(2);
    // Siebdruck (3T) startet 5T vor Liefertermin, endet wo Stickerei startet.
    expect(plan[0]).toMatchObject({ label: "Siebdruck", start: addDays(delivery, -5), end: addDays(delivery, -2) });
    // Stickerei (2T) endet am Liefertermin.
    expect(plan[1]).toMatchObject({ label: "Stickerei", start: addDays(delivery, -2), end: delivery });
  });

  it("der erste Start entspricht backwardStart", () => {
    const plan = scheduleBackward(delivery, stages);
    expect(plan[0]?.start).toEqual(backwardStart(delivery, stages));
  });
});
