// Generisches Dashboard (G-7): wiederverwendbare Charts/Cards, Zusammenstellung zu
// einem Dashboard, Auflösung mit berechneten Metrikdaten. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { DashboardError, DashboardService } from "./dashboard.service.js";
import { FakeMetricRepository, InMemoryDashboardRepository } from "../../repositories/in-memory-dashboard.repository.js";

function setup(): DashboardService {
  return new DashboardService(new InMemoryDashboardRepository(), new FakeMetricRepository());
}

describe("DashboardService (G-7)", () => {
  it("stellt Karte + Chart zusammen und löst mit Daten auf", async () => {
    const svc = setup();
    const card = await svc.createCard("Aufträge gesamt", "orders.count.total");
    const chart = await svc.createChart("Nach Status", "BAR", "orders.count.byStatus");
    const dash = await svc.createDashboard("Vertrieb");
    await svc.addItem(dash.id, "CARD", card.id, "HALF");
    await svc.addItem(dash.id, "CHART", chart.id, "FULL");

    const resolved = await svc.getResolved(dash.id);
    expect(resolved.name).toBe("Vertrieb");
    expect(resolved.widgets).toHaveLength(2);
    const c = resolved.widgets.find((w) => w.kind === "CARD");
    expect(c?.value).toBe(42); // NUMBER-Metrik
    const ch = resolved.widgets.find((w) => w.kind === "CHART");
    expect(ch?.series).toHaveLength(2); // SERIES-Metrik
    expect(ch?.chartType).toBe("BAR");
  });

  it("verbietet unbekannte Metrik-Schlüssel", async () => {
    const svc = setup();
    await expect(svc.createCard("X", "nicht.im.katalog")).rejects.toBeInstanceOf(DashboardError);
  });

  it("der Metrik-Katalog ist nicht leer und hat NUMBER + SERIES", async () => {
    const m = setup().listMetrics();
    expect(m.some((x) => x.kind === "NUMBER")).toBe(true);
    expect(m.some((x) => x.kind === "SERIES")).toBe(true);
  });

  it("wirft beim Auflösen eines unbekannten Dashboards", async () => {
    await expect(setup().getResolved("nope")).rejects.toBeInstanceOf(DashboardError);
  });
});
