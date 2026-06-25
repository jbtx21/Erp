import { describe, expect, it } from "vitest";
import { bundleOrderLines, currentPeriod, type BundleInputLine } from "./sammelbestellung.js";

describe("currentPeriod", () => {
  const day = new Date("2026-05-20T10:00:00Z"); // Mittwoch, Mai, Q2, H1
  it("monatlich → Monatsfenster", () => {
    const p = currentPeriod("MONATLICH", day);
    expect(p.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(p.label).toBe("Mai 2026");
  });
  it("quartalsweise → Q2", () => {
    const p = currentPeriod("QUARTALSWEISE", day);
    expect(p.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(p.label).toBe("Q2/2026");
  });
  it("halbjährlich → H1", () => {
    const p = currentPeriod("HALBJAEHRLICH", day);
    expect(p.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(p.label).toBe("H1/2026");
  });
  it("wöchentlich → Mo–So-Fenster (7 Tage)", () => {
    const p = currentPeriod("WOECHENTLICH", day);
    expect(p.start.getUTCDay()).toBe(1); // Montag
    expect((p.end.getTime() - p.start.getTime()) / (24 * 3600 * 1000)).toBe(7);
    expect(p.label).toMatch(/^KW \d{2}\/2026$/);
  });
  it("zweite Jahreshälfte → H2", () => {
    expect(currentPeriod("HALBJAEHRLICH", new Date("2026-09-01T00:00:00Z")).label).toBe("H2/2026");
  });
});

describe("bundleOrderLines", () => {
  const lines: BundleInputLine[] = [
    { kind: "TEXTIL", key: "v-polo-l", label: "Polo Navy / L", qty: 5 },
    { kind: "TEXTIL", key: "v-polo-l", label: "Polo Navy / L", qty: 3 },
    { kind: "TEXTIL", key: "v-polo-m", label: "Polo Navy / M", qty: 2 },
    { kind: "VEREDELUNG", key: "stick-brust", label: "Stick Brust links", qty: 8 },
    { kind: "VEREDELUNG", key: "stick-brust", label: "Stick Brust links", qty: 2 },
  ];
  it("fasst Artikel je Schlüssel zusammen und summiert Mengen", () => {
    const r = bundleOrderLines(lines);
    const polL = r.artikel.find((a) => a.key === "v-polo-l")!;
    expect(polL.qty).toBe(8);
    expect(polL.positionen).toBe(2);
    expect(r.gesamtArtikel).toBe(10);
  });
  it("fasst Veredelung separat zusammen", () => {
    const r = bundleOrderLines(lines);
    expect(r.veredelung).toHaveLength(1);
    expect(r.veredelung[0]!.qty).toBe(10);
    expect(r.gesamtVeredelung).toBe(10);
  });
  it("sortiert Artikel nach Menge absteigend", () => {
    const r = bundleOrderLines(lines);
    expect(r.artikel[0]!.key).toBe("v-polo-l"); // 8 > 2
  });
});
