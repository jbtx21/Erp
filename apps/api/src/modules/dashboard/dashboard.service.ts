// Generisches Dashboard (ERP-Grundfunktion / G-7): Charts + KPI-Kacheln als
// wiederverwendbare Entitäten, die mehreren Dashboards zugeordnet werden können.
// Jede referenziert einen Schlüssel aus einem FESTEN Metrik-Katalog (bewusst bounded,
// kein unbegrenzter Aggregations-Generator) — die Berechnung liegt in MetricRepository.

export type ChartType = "BAR" | "LINE" | "DONUT";
export type WidgetKind = "CHART" | "CARD";
export type WidgetWidth = "FULL" | "HALF";
export type MetricKind = "NUMBER" | "SERIES";

export interface MetricDef {
  key: string;
  label: string;
  kind: MetricKind;
}

export const METRIC_CATALOG: ReadonlyArray<MetricDef> = [
  { key: "orders.count.total", label: "Aufträge gesamt", kind: "NUMBER" },
  { key: "companies.count.total", label: "Firmen gesamt", kind: "NUMBER" },
  { key: "suppliers.count.total", label: "Lieferanten gesamt", kind: "NUMBER" },
  { key: "invoices.sum.net", label: "Umsatz netto (Cent)", kind: "NUMBER" },
  { key: "orders.count.byStatus", label: "Aufträge nach Status", kind: "SERIES" },
  { key: "orders.count.byLieferstatus", label: "Aufträge nach Lieferstatus", kind: "SERIES" },
];
const METRIC_BY_KEY = new Map(METRIC_CATALOG.map((m) => [m.key, m]));

export interface MetricValue {
  value: number | null;
  series: { label: string; value: number }[] | null;
}

export interface MetricRepository {
  compute(key: string): Promise<MetricValue>;
}

export interface ChartItem { id: string; name: string; chartType: ChartType; metricKey: string }
export interface CardItem { id: string; name: string; metricKey: string }
export interface DashboardSummary { id: string; name: string; ownerEmail: string | null; isDefault: boolean }
export interface DashboardItemRow { id: string; kind: WidgetKind; refId: string; width: WidgetWidth; position: number }

export interface DashboardRepository {
  createChart(name: string, chartType: ChartType, metricKey: string): Promise<ChartItem>;
  createCard(name: string, metricKey: string): Promise<CardItem>;
  listCharts(): Promise<ChartItem[]>;
  listCards(): Promise<CardItem[]>;
  getChart(id: string): Promise<ChartItem | null>;
  getCard(id: string): Promise<CardItem | null>;
  createDashboard(name: string, ownerEmail: string | null): Promise<DashboardSummary>;
  /** Dashboards eines Mitarbeiters: eigene (ownerEmail) + geteilte (ownerEmail null). */
  listForUser(ownerEmail: string): Promise<DashboardSummary[]>;
  getDashboard(id: string): Promise<{ id: string; name: string; items: DashboardItemRow[] } | null>;
  addItem(dashboardId: string, kind: WidgetKind, refId: string, width: WidgetWidth): Promise<DashboardItemRow>;
  removeItem(itemId: string): Promise<void>;
  getItem(itemId: string): Promise<{ id: string; dashboardId: string; position: number } | null>;
  listItems(dashboardId: string): Promise<DashboardItemRow[]>;
  updateItemPosition(itemId: string, position: number): Promise<void>;
  setDefault(dashboardId: string, ownerEmail: string): Promise<void>;
}

export interface ResolvedWidget {
  id: string;
  kind: WidgetKind;
  width: WidgetWidth;
  title: string;
  chartType: ChartType | null;
  metricKind: MetricKind;
  value: number | null;
  series: { label: string; value: number }[] | null;
}
export interface ResolvedDashboard { id: string; name: string; widgets: ResolvedWidget[] }

export class DashboardError extends Error {}

export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly metrics: MetricRepository
  ) {}

  listMetrics(): ReadonlyArray<MetricDef> {
    return METRIC_CATALOG;
  }
  listCharts(): Promise<ChartItem[]> { return this.repo.listCharts(); }
  listCards(): Promise<CardItem[]> { return this.repo.listCards(); }
  /** Persönliche + geteilte Dashboards des Mitarbeiters. */
  listForUser(ownerEmail: string): Promise<DashboardSummary[]> { return this.repo.listForUser(ownerEmail); }

  private assertMetric(key: string): MetricDef {
    const m = METRIC_BY_KEY.get(key);
    if (!m) throw new DashboardError(`Unbekannte Metrik '${key}'.`);
    return m;
  }

  async createChart(name: string, chartType: ChartType, metricKey: string): Promise<ChartItem> {
    if (!name.trim()) throw new DashboardError("Name ist Pflicht.");
    this.assertMetric(metricKey);
    return this.repo.createChart(name.trim(), chartType, metricKey);
  }
  async createCard(name: string, metricKey: string): Promise<CardItem> {
    if (!name.trim()) throw new DashboardError("Name ist Pflicht.");
    this.assertMetric(metricKey);
    return this.repo.createCard(name.trim(), metricKey);
  }
  async createDashboard(name: string, ownerEmail: string | null): Promise<DashboardSummary> {
    if (!name.trim()) throw new DashboardError("Name ist Pflicht.");
    return this.repo.createDashboard(name.trim(), ownerEmail);
  }
  addItem(dashboardId: string, kind: WidgetKind, refId: string, width: WidgetWidth): Promise<DashboardItemRow> {
    return this.repo.addItem(dashboardId, kind, refId, width);
  }
  removeItem(itemId: string): Promise<void> {
    return this.repo.removeItem(itemId);
  }
  setDefault(dashboardId: string, ownerEmail: string): Promise<void> {
    return this.repo.setDefault(dashboardId, ownerEmail);
  }

  /** Verschiebt eine Kachel in der Reihenfolge (freie Anordnung). */
  async moveItem(itemId: string, direction: "UP" | "DOWN"): Promise<void> {
    const it = await this.repo.getItem(itemId);
    if (!it) throw new DashboardError(`Kachel ${itemId} nicht gefunden.`);
    const items = (await this.repo.listItems(it.dashboardId)).sort((a, b) => a.position - b.position);
    const idx = items.findIndex((x) => x.id === itemId);
    const neighborIdx = direction === "UP" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= items.length) return; // Rand → No-Op
    const neighbor = items[neighborIdx]!;
    await this.repo.updateItemPosition(it.id, neighbor.position);
    await this.repo.updateItemPosition(neighbor.id, it.position);
  }

  /** Löst ein Dashboard auf: jede Kachel mit berechneten Metrikdaten. */
  async getResolved(dashboardId: string): Promise<ResolvedDashboard> {
    const d = await this.repo.getDashboard(dashboardId);
    if (!d) throw new DashboardError(`Dashboard ${dashboardId} nicht gefunden.`);
    const widgets: ResolvedWidget[] = [];
    for (const it of [...d.items].sort((a, b) => a.position - b.position)) {
      if (it.kind === "CHART") {
        const c = await this.repo.getChart(it.refId);
        if (!c) continue;
        const m = await this.metrics.compute(c.metricKey);
        widgets.push({ id: it.id, kind: "CHART", width: it.width, title: c.name, chartType: c.chartType, metricKind: METRIC_BY_KEY.get(c.metricKey)?.kind ?? "SERIES", value: m.value, series: m.series });
      } else {
        const c = await this.repo.getCard(it.refId);
        if (!c) continue;
        const m = await this.metrics.compute(c.metricKey);
        widgets.push({ id: it.id, kind: "CARD", width: it.width, title: c.name, chartType: null, metricKind: METRIC_BY_KEY.get(c.metricKey)?.kind ?? "NUMBER", value: m.value, series: m.series });
      }
    }
    return { id: d.id, name: d.name, widgets };
  }
}
