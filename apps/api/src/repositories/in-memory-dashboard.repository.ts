// In-Memory-Implementierung des Dashboards + eine deterministische Metrik-Quelle (Tests/Dev).

import type {
  CardItem,
  ChartItem,
  ChartType,
  DashboardItemRow,
  DashboardRepository,
  DashboardSummary,
  MetricRepository,
  MetricValue,
  WidgetKind,
  WidgetWidth,
} from "../modules/dashboard/dashboard.service.js";

export class InMemoryDashboardRepository implements DashboardRepository {
  private charts: ChartItem[] = [];
  private cards: CardItem[] = [];
  private dashboards: DashboardSummary[] = [];
  private items: (DashboardItemRow & { dashboardId: string })[] = [];
  private seq = 0;
  private id(p: string): string { return `${p}_${String(++this.seq)}`; }

  async createChart(name: string, chartType: ChartType, metricKey: string): Promise<ChartItem> {
    const c = { id: this.id("chart"), name, chartType, metricKey }; this.charts.push(c); return c;
  }
  async createCard(name: string, metricKey: string): Promise<CardItem> {
    const c = { id: this.id("card"), name, metricKey }; this.cards.push(c); return c;
  }
  async listCharts(): Promise<ChartItem[]> { return this.charts; }
  async listCards(): Promise<CardItem[]> { return this.cards; }
  async getChart(id: string): Promise<ChartItem | null> { return this.charts.find((c) => c.id === id) ?? null; }
  async getCard(id: string): Promise<CardItem | null> { return this.cards.find((c) => c.id === id) ?? null; }
  async createDashboard(name: string, ownerEmail: string | null): Promise<DashboardSummary> {
    const d = { id: this.id("dash"), name, ownerEmail, isDefault: false }; this.dashboards.push(d); return d;
  }
  async listForUser(ownerEmail: string): Promise<DashboardSummary[]> {
    return this.dashboards.filter((d) => d.ownerEmail === ownerEmail || d.ownerEmail === null);
  }
  async getDashboard(id: string): Promise<{ id: string; name: string; items: DashboardItemRow[] } | null> {
    const d = this.dashboards.find((x) => x.id === id);
    if (!d) return null;
    return { id: d.id, name: d.name, items: this.items.filter((i) => i.dashboardId === id) };
  }
  async addItem(dashboardId: string, kind: WidgetKind, refId: string, width: WidgetWidth): Promise<DashboardItemRow> {
    const position = this.items.filter((i) => i.dashboardId === dashboardId).length;
    const item = { id: this.id("item"), kind, refId, width, position, dashboardId };
    this.items.push(item);
    return { id: item.id, kind, refId, width, position };
  }
  async removeItem(itemId: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== itemId);
  }
  async getItem(itemId: string): Promise<{ id: string; dashboardId: string; position: number } | null> {
    const i = this.items.find((x) => x.id === itemId);
    return i ? { id: i.id, dashboardId: i.dashboardId, position: i.position } : null;
  }
  async listItems(dashboardId: string): Promise<DashboardItemRow[]> {
    return this.items
      .filter((i) => i.dashboardId === dashboardId)
      .map(({ id, kind, refId, width, position }) => ({ id, kind, refId, width, position }));
  }
  async updateItemPosition(itemId: string, position: number): Promise<void> {
    const i = this.items.find((x) => x.id === itemId);
    if (i) i.position = position;
  }
  async setDefault(dashboardId: string, ownerEmail: string): Promise<void> {
    for (const d of this.dashboards) {
      if (d.ownerEmail === ownerEmail) d.isDefault = d.id === dashboardId;
    }
  }
}

// Deterministische Metrik-Quelle für Tests: SERIES-Schlüssel → zwei Stufen, sonst NUMBER 42.
export class FakeMetricRepository implements MetricRepository {
  async compute(key: string): Promise<MetricValue> {
    if (key.includes("by")) return { value: null, series: [{ label: "A", value: 3 }, { label: "B", value: 7 }] };
    return { value: 42, series: null };
  }
}
