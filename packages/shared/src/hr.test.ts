import { describe, expect, it } from "vitest";
import { remainingVacation, workdaysBetween } from "./hr.js";

describe("HR-Urlaubslogik", () => {
  it("zählt Werktage Mo–Fr inklusive (überspringt Wochenende)", () => {
    // Mo 2026-06-22 .. Fr 2026-06-26 = 5 Werktage
    expect(workdaysBetween(new Date("2026-06-22"), new Date("2026-06-26"))).toBe(5);
    // Mo .. So (eine Woche) = 5
    expect(workdaysBetween(new Date("2026-06-22"), new Date("2026-06-28"))).toBe(5);
    // Sa+So = 0
    expect(workdaysBetween(new Date("2026-06-27"), new Date("2026-06-28"))).toBe(0);
  });
  it("Resturlaub = Anspruch − genehmigt", () => {
    expect(remainingVacation(30, 12)).toBe(18);
  });
});
