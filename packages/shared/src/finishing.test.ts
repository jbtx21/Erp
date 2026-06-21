import { describe, expect, it } from "vitest";
import { DEFAULT_FINISHING_TARGET_TIMES, plannedMinutes } from "./finishing.js";

describe("Sollzeiten je Veredelungsart (K-09)", () => {
  it("rechnet STUECK-basierte Veredelung über die Stückzahl", () => {
    expect(plannedMinutes({ kind: "TRANSFER", qty: 100 })).toBe(150); // 1,5 × 100
  });

  it("rechnet Siebdruck-Einrichtung je Einrichtung", () => {
    expect(plannedMinutes({ kind: "SIEBDRUCK_EINRICHTUNG", qty: 1 })).toBe(20);
  });

  it("rechnet Stick über die Stichzahl (je 1.000 Stiche)", () => {
    expect(plannedMinutes({ kind: "STICK", qty: 1, stitchCount: 5000 })).toBe(40);
  });

  it("erlaubt eine überschriebene Sollzeit-Tabelle", () => {
    const custom = {
      ...DEFAULT_FINISHING_TARGET_TIMES,
      TRANSFER: { kind: "TRANSFER" as const, targetMinutes: 2, basis: "STUECK" as const },
    };
    expect(plannedMinutes({ kind: "TRANSFER", qty: 10 }, custom)).toBe(20);
  });
});
