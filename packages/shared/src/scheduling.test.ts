import { describe, expect, it } from "vitest";
import {
  addDays,
  addWorkingDays,
  backwardStart,
  FINISHING_LEAD_PROFILES,
  proposeProductionDueDate,
  scheduleBackward,
  subtractWorkingDays,
  type LeadStage,
} from "./scheduling.js";

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

describe("Werktage-Terminierung (Veredelungs-Durchlaufzeiten)", () => {
  // Di 30.06.2026 ist ein Dienstag; 5 Werktage zurück überspringt das Wochenende.
  const di = new Date(Date.UTC(2026, 5, 30));

  it("subtractWorkingDays überspringt Wochenenden", () => {
    // 30.06 (Di) − 5 WT: Mo 29, Fr 26, Do 25, Mi 24, Di 23 → 23.06.2026
    expect(subtractWorkingDays(di, 5)).toEqual(new Date(Date.UTC(2026, 5, 23)));
  });

  it("subtractWorkingDays über ein Wochenende hinweg (Montag − 1 WT = Freitag)", () => {
    const mo = new Date(Date.UTC(2026, 5, 29)); // Montag
    expect(subtractWorkingDays(mo, 1)).toEqual(new Date(Date.UTC(2026, 5, 26))); // Freitag
  });

  it("addWorkingDays ist die Umkehrung über Werktage", () => {
    expect(addWorkingDays(subtractWorkingDays(di, 7), 7)).toEqual(di);
  });

  it("Profile bilden die TEXMA-Durchlaufzeiten ab (5/7/10 Werktage)", () => {
    expect(FINISHING_LEAD_PROFILES.INHOUSE_OHNE_TRANSFER.leadWorkingDays).toBe(5);
    expect(FINISHING_LEAD_PROFILES.INHOUSE_MIT_TRANSFER.leadWorkingDays).toBe(7);
    expect(FINISHING_LEAD_PROFILES.EXTERN_STICK_SIEBDRUCK.leadWorkingDays).toBe(10);
    expect(FINISHING_LEAD_PROFILES.EXTERN_STICK_SIEBDRUCK.external).toBe(true);
    expect(FINISHING_LEAD_PROFILES.EXTERN_UND_INTERN.leadWorkingDays).toBe(12);
    expect(FINISHING_LEAD_PROFILES.EXTERN_UND_INTERN.external).toBe(true);
  });

  it("proposeProductionDueDate = Liefertermin − Werktage", () => {
    expect(proposeProductionDueDate(di, 5)).toEqual(subtractWorkingDays(di, 5));
  });

  it("überspringt BW-Feiertage (Karfreitag/Ostermontag 2026)", () => {
    // Di 07.04.2026 − 1 WT: Mo 06.04 ist Ostermontag (Feiertag) → Fr 03.04? Nein, 03.04
    // ist Karfreitag. Also weiter: Do 02.04.2026.
    const diNachOstern = new Date(Date.UTC(2026, 3, 7));
    expect(subtractWorkingDays(diNachOstern, 1)).toEqual(new Date(Date.UTC(2026, 3, 2)));
  });

  it("überspringt Neujahr (BW) bei der Rückrechnung", () => {
    // Fr 02.01.2026 − 1 WT: Do 01.01 = Neujahr (Feiertag) → Mi 31.12.2025.
    const fr = new Date(Date.UTC(2026, 0, 2));
    expect(subtractWorkingDays(fr, 1)).toEqual(new Date(Date.UTC(2025, 11, 31)));
  });
});
