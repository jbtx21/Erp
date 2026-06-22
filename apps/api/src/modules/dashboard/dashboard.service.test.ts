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
    const dash = await svc.createDashboard("Vertrieb", "anna@texma.de");
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

  it("personalisiert je Mitarbeiter: eigene + geteilte Dashboards, fremde nicht", async () => {
    const svc = setup();
    const meins = await svc.createDashboard("Anna privat", "anna@texma.de");
    await svc.createDashboard("Bert privat", "bert@texma.de");
    const geteilt = await svc.createDashboard("Team", null);

    const fuerAnna = await svc.listForUser("anna@texma.de");
    const ids = fuerAnna.map((d) => d.id);
    expect(ids).toContain(meins.id);
    expect(ids).toContain(geteilt.id);
    expect(fuerAnna).toHaveLength(2); // Berts privates Dashboard ist nicht dabei
  });

  it("setzt ein persönliches Standard-Dashboard (nur eines je Mitarbeiter)", async () => {
    const svc = setup();
    const a = await svc.createDashboard("A", "anna@texma.de");
    const b = await svc.createDashboard("B", "anna@texma.de");
    await svc.setDefault(a.id, "anna@texma.de");
    await svc.setDefault(b.id, "anna@texma.de");
    const list = await svc.listForUser("anna@texma.de");
    expect(list.find((d) => d.id === a.id)?.isDefault).toBe(false);
    expect(list.find((d) => d.id === b.id)?.isDefault).toBe(true);
  });

  it("ordnet Kacheln frei um (moveItem tauscht Positionen)", async () => {
    const svc = setup();
    const card = await svc.createCard("K", "orders.count.total");
    const chart = await svc.createChart("C", "BAR", "orders.count.byStatus");
    const dash = await svc.createDashboard("D", "anna@texma.de");
    const i1 = await svc.addItem(dash.id, "CARD", card.id, "HALF");
    const i2 = await svc.addItem(dash.id, "CHART", chart.id, "FULL");
    expect(i1.position).toBe(0);
    expect(i2.position).toBe(1);
    await svc.moveItem(i2.id, "UP");
    const resolved = await svc.getResolved(dash.id);
    expect(resolved.widgets[0]?.kind).toBe("CHART"); // Chart steht jetzt vorne
    expect(resolved.widgets[1]?.kind).toBe("CARD");
  });

  it("entfernt eine Kachel", async () => {
    const svc = setup();
    const card = await svc.createCard("K", "orders.count.total");
    const dash = await svc.createDashboard("D", "anna@texma.de");
    const it = await svc.addItem(dash.id, "CARD", card.id, "HALF");
    await svc.removeItem(it.id);
    const resolved = await svc.getResolved(dash.id);
    expect(resolved.widgets).toHaveLength(0);
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
