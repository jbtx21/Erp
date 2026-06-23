import { describe, expect, it } from "vitest";
import { bwHolidays, easterSunday, isBwHoliday } from "./holidays.js";

describe("Baden-Württemberg Feiertage", () => {
  it("Ostersonntag 2026 = 05.04.2026", () => {
    expect(easterSunday(2026)).toEqual(new Date(Date.UTC(2026, 3, 5)));
  });

  it("enthält feste und bewegliche BW-Feiertage 2026", () => {
    const h = bwHolidays(2026);
    expect(h.has("2026-01-01")).toBe(true); // Neujahr
    expect(h.has("2026-01-06")).toBe(true); // Heilige Drei Könige
    expect(h.has("2026-04-03")).toBe(true); // Karfreitag (Ostern −2)
    expect(h.has("2026-04-06")).toBe(true); // Ostermontag (Ostern +1)
    expect(h.has("2026-05-14")).toBe(true); // Christi Himmelfahrt (Ostern +39)
    expect(h.has("2026-06-04")).toBe(true); // Fronleichnam (Ostern +60)
    expect(h.has("2026-11-01")).toBe(true); // Allerheiligen
    expect(h.has("2026-12-26")).toBe(true); // 2. Weihnachtstag
  });

  it("Reformationstag ist in BW KEIN Feiertag", () => {
    expect(isBwHoliday(new Date(Date.UTC(2026, 9, 31)))).toBe(false); // 31.10.
  });
});
