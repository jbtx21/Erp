// Reporting-Anwendungsfall (Kap. 29): Umsatz-/Auftrags-Übersicht, Periodenvergleich
// und KI-Zusammenfassung. Repository + KI-Client als Fakes — keine DB, kein Netz.

import { describe, expect, it, vi } from "vitest";
import type { LabeledRevenuePoint, OrderPoint, RevenuePoint } from "@texma/shared";
import { InMemoryReportingRepository } from "../../repositories/in-memory-reporting.repository.js";
import { ReportingService, type AiReportClient } from "./reporting.service.js";

const at = (iso: string): Date => new Date(iso);

const revenue: RevenuePoint[] = [
  { at: at("2026-05-10T09:00:00Z"), netCents: 20_000 },
  { at: at("2026-06-05T09:00:00Z"), netCents: 18_000 },
  { at: at("2026-06-20T09:00:00Z"), netCents: 12_000 },
];
const orders: OrderPoint[] = [
  { at: at("2026-05-10T09:00:00Z"), netCents: 25_000 },
  { at: at("2026-06-05T09:00:00Z"), netCents: 30_000 },
  { at: at("2026-06-06T09:00:00Z"), netCents: 5_000 },
];
const byShop: LabeledRevenuePoint[] = [
  { label: "shop_a", name: "Shop A", netCents: 30_000 },
  { label: "shop_b", name: "Shop B", netCents: 20_000 },
];
const byPriceGroup: LabeledRevenuePoint[] = [
  { label: "STANDARD", name: "Standard", netCents: 35_000 },
  { label: "PREMIUM", name: "Premium", netCents: 15_000 },
];

function service(ai: AiReportClient | null = null): ReportingService {
  return new ReportingService(
    new InMemoryReportingRepository(revenue, orders, byShop, byPriceGroup),
    ai
  );
}

describe("ReportingService (Kap. 29)", () => {
  it("liefert die Umsatz-Übersicht je Monat mit Gesamtsumme", async () => {
    const res = await service().revenueOverview("MONTH");
    expect(res.buckets.map((b) => b.key)).toEqual(["2026-05", "2026-06"]);
    expect(res.buckets[1]).toMatchObject({ count: 2, netCents: 30_000 });
    expect(res.totalNetCents).toBe(50_000);
  });

  it("liefert die Auftrags-Übersicht mit Anzahl + Auftragswert", async () => {
    const res = await service().orderOverview("MONTH");
    expect(res.totalCount).toBe(3);
    expect(res.totalNetCents).toBe(60_000);
    expect(res.buckets[1]).toMatchObject({ key: "2026-06", count: 2, netCents: 35_000 });
  });

  it("schlüsselt den Umsatz nach Shop auf (absteigend, mit Anteil)", async () => {
    const res = await service().revenueByShop();
    expect(res.map((r) => r.label)).toEqual(["shop_a", "shop_b"]);
    expect(res[0]).toMatchObject({ name: "Shop A", netCents: 30_000, sharePercent: 60 });
  });

  it("schlüsselt den Umsatz nach Kundengruppe auf", async () => {
    const res = await service().revenueByPriceGroup();
    expect(res[0]).toMatchObject({ label: "STANDARD", netCents: 35_000, sharePercent: 70 });
  });

  it("vergleicht den Umsatz Juni mit Mai (Delta + Prozent)", async () => {
    const cmp = await service().compareRevenue("MONTH", at("2026-06-19T00:00:00Z"));
    expect(cmp.current.netCents).toBe(30_000);
    expect(cmp.previous?.netCents).toBe(20_000);
    expect(cmp.deltaCents).toBe(10_000);
    expect(cmp.deltaPercent).toBe(50);
  });

  it("nutzt den KI-Client für die Zusammenfassung, wenn vorhanden", async () => {
    const ai: AiReportClient = { summarize: vi.fn().mockResolvedValue("Der Umsatz wächst im Juni.") };
    const res = await service(ai).aiSummary("MONTH", at("2026-06-19T00:00:00Z"));
    expect(res.aiGenerated).toBe(true);
    expect(res.narrative).toBe("Der Umsatz wächst im Juni.");
    expect(ai.summarize).toHaveBeenCalledOnce();
    // Der Prompt trägt die aggregierten Kennzahlen, keine Kundennamen.
    const prompt = (ai.summarize as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(prompt).toContain("Umsatz");
    expect(prompt).toContain("2026-06");
  });

  it("fällt ohne KI-Client auf eine deterministische Heuristik zurück", async () => {
    const res = await service(null).aiSummary("MONTH", at("2026-06-19T00:00:00Z"));
    expect(res.aiGenerated).toBe(false);
    expect(res.narrative).toContain("gestiegen");
  });

  it("exportiert die Umsatz-Auswertung als PDF (base64)", async () => {
    const res = await service().exportPdf("MONTH", at("2026-06-19T00:00:00Z"));
    expect(res.fileName).toBe("Umsatz-Auswertung-MONTH.pdf");
    expect(Buffer.from(res.pdfBase64, "base64").subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("fällt bei einem KI-Fehler auf die Heuristik zurück (Bericht bleibt verfügbar)", async () => {
    const ai: AiReportClient = { summarize: vi.fn().mockRejectedValue(new Error("kein Budget")) };
    const res = await service(ai).aiSummary("MONTH", at("2026-06-19T00:00:00Z"));
    expect(res.aiGenerated).toBe(false);
    expect(res.narrative.length).toBeGreaterThan(0);
  });
});
