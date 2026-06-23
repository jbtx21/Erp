import { describe, expect, it } from "vitest";
import { summarizeQuoteConversion, type QuotePoint } from "./quote-report.js";

const points: QuotePoint[] = [
  { at: new Date("2026-03-01"), status: "ANGENOMMEN", verlustgrund: null, netCents: 100_00 },
  { at: new Date("2026-03-02"), status: "ANGENOMMEN", verlustgrund: null, netCents: 50_00 },
  { at: new Date("2026-03-03"), status: "ABGELEHNT", verlustgrund: "Preis", netCents: 80_00 },
  { at: new Date("2026-03-04"), status: "ABGELEHNT", verlustgrund: "Preis", netCents: 20_00 },
  { at: new Date("2026-03-05"), status: "ABGELEHNT", verlustgrund: null, netCents: 10_00 },
  { at: new Date("2026-03-06"), status: "VERSENDET", verlustgrund: null, netCents: 30_00 },
];

describe("Angebots-Erfolgsquote (Kap. 35.1)", () => {
  it("zählt gewonnen/verloren/offen und berechnet die Win-Rate über entschiedene", () => {
    const r = summarizeQuoteConversion(points);
    expect(r.total).toBe(6);
    expect(r.won).toBe(2);
    expect(r.lost).toBe(3);
    expect(r.open).toBe(1);
    expect(r.winRatePercent).toBe(40); // 2 / (2+3)
    expect(r.wonNetCents).toBe(150_00);
    expect(r.quotedNetCents).toBe(290_00);
  });

  it("schlüsselt Verlustgründe absteigend auf, leere als ohne-Angabe", () => {
    const r = summarizeQuoteConversion(points);
    expect(r.lossReasons[0]).toEqual({ reason: "Preis", count: 2 });
    expect(r.lossReasons.find((x) => x.reason === "ohne Angabe")?.count).toBe(1);
  });

  it("filtert auf den Zeitraum und liefert 0-Win-Rate ohne entschiedene Angebote", () => {
    const r = summarizeQuoteConversion(points, { from: new Date("2026-03-06"), to: new Date("2026-03-31") });
    expect(r.total).toBe(1);
    expect(r.open).toBe(1);
    expect(r.winRatePercent).toBe(0);
  });
});
