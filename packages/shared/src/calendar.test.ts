import { describe, expect, it } from "vitest";
import { assertEventRange, CalendarRangeError, overlapsWindow } from "./calendar.js";

describe("Kalender-Hilfslogik", () => {
  it("akzeptiert gültigen Zeitraum, lehnt Ende-vor-Beginn ab", () => {
    expect(() => assertEventRange(new Date("2026-06-01"), new Date("2026-06-02"))).not.toThrow();
    expect(() => assertEventRange(new Date("2026-06-02"), new Date("2026-06-01"))).toThrow(CalendarRangeError);
  });
  it("erkennt Überschneidung mit dem Anzeigefenster", () => {
    const from = new Date("2026-06-10"), to = new Date("2026-06-20");
    expect(overlapsWindow(new Date("2026-06-15"), new Date("2026-06-16"), from, to)).toBe(true);
    expect(overlapsWindow(new Date("2026-06-05"), new Date("2026-06-12"), from, to)).toBe(true);
    expect(overlapsWindow(new Date("2026-06-21"), new Date("2026-06-22"), from, to)).toBe(false);
  });
});
