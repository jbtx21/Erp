// Prisma-Implementierung des generischen Dashboards (G-7): Persistenz der Charts/Cards/
// Dashboards + Metrik-Berechnung über echte Aggregationen (fester Katalog).

import { prisma } from "@texma/db";
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

export class PrismaDashboardRepository implements DashboardRepository {
  async createChart(name: string, chartType: ChartType, metricKey: string): Promise<ChartItem> {
    const c = await prisma.dashboardChart.create({ data: { name, chartType: chartType as never, metricKey } });
    return { id: c.id, name: c.name, chartType: c.chartType as ChartType, metricKey: c.metricKey };
  }
  async createCard(name: string, metricKey: string): Promise<CardItem> {
    return prisma.numberCard.create({ data: { name, metricKey }, select: { id: true, name: true, metricKey: true } });
  }
  async listCharts(): Promise<ChartItem[]> {
    const rows = await prisma.dashboardChart.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map((c) => ({ id: c.id, name: c.name, chartType: c.chartType as ChartType, metricKey: c.metricKey }));
  }
  async listCards(): Promise<CardItem[]> {
    return prisma.numberCard.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, metricKey: true } });
  }
  async getChart(id: string): Promise<ChartItem | null> {
    const c = await prisma.dashboardChart.findUnique({ where: { id } });
    return c ? { id: c.id, name: c.name, chartType: c.chartType as ChartType, metricKey: c.metricKey } : null;
  }
  async getCard(id: string): Promise<CardItem | null> {
    return prisma.numberCard.findUnique({ where: { id }, select: { id: true, name: true, metricKey: true } });
  }
  async createDashboard(name: string, ownerEmail: string | null): Promise<DashboardSummary> {
    return prisma.dashboard.create({ data: { name, ownerEmail }, select: { id: true, name: true, ownerEmail: true, isDefault: true } });
  }
  async listForUser(ownerEmail: string): Promise<DashboardSummary[]> {
    return prisma.dashboard.findMany({
      where: { OR: [{ ownerEmail }, { ownerEmail: null }] },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, ownerEmail: true, isDefault: true },
    });
  }
  async getDashboard(id: string): Promise<{ id: string; name: string; items: DashboardItemRow[] } | null> {
    const d = await prisma.dashboard.findUnique({
      where: { id },
      select: { id: true, name: true, items: { select: { id: true, kind: true, refId: true, width: true, position: true } } },
    });
    if (!d) return null;
    return { id: d.id, name: d.name, items: d.items.map((i) => ({ id: i.id, kind: i.kind as WidgetKind, refId: i.refId, width: i.width as WidgetWidth, position: i.position })) };
  }
  async addItem(dashboardId: string, kind: WidgetKind, refId: string, width: WidgetWidth): Promise<DashboardItemRow> {
    const count = await prisma.dashboardItem.count({ where: { dashboardId } });
    const i = await prisma.dashboardItem.create({
      data: { dashboardId, kind: kind as never, refId, width: width as never, position: count },
    });
    return { id: i.id, kind: i.kind as WidgetKind, refId: i.refId, width: i.width as WidgetWidth, position: i.position };
  }
  async removeItem(itemId: string): Promise<void> {
    await prisma.dashboardItem.delete({ where: { id: itemId } });
  }
  async getItem(itemId: string): Promise<{ id: string; dashboardId: string; position: number } | null> {
    return prisma.dashboardItem.findUnique({ where: { id: itemId }, select: { id: true, dashboardId: true, position: true } });
  }
  async listItems(dashboardId: string): Promise<DashboardItemRow[]> {
    const rows = await prisma.dashboardItem.findMany({ where: { dashboardId }, orderBy: { position: "asc" }, select: { id: true, kind: true, refId: true, width: true, position: true } });
    return rows.map((i) => ({ id: i.id, kind: i.kind as WidgetKind, refId: i.refId, width: i.width as WidgetWidth, position: i.position }));
  }
  async updateItemPosition(itemId: string, position: number): Promise<void> {
    await prisma.dashboardItem.update({ where: { id: itemId }, data: { position } });
  }
  async setDefault(dashboardId: string, ownerEmail: string): Promise<void> {
    await prisma.$transaction([
      prisma.dashboard.updateMany({ where: { ownerEmail }, data: { isDefault: false } }),
      prisma.dashboard.update({ where: { id: dashboardId }, data: { isDefault: true } }),
    ]);
  }
}

export class PrismaMetricRepository implements MetricRepository {
  async compute(key: string): Promise<MetricValue> {
    switch (key) {
      case "orders.count.total":
        return { value: await prisma.order.count(), series: null };
      case "companies.count.total":
        return { value: await prisma.company.count(), series: null };
      case "suppliers.count.total":
        return { value: await prisma.supplier.count(), series: null };
      case "invoices.sum.net": {
        const agg = await prisma.invoice.aggregate({ _sum: { netCents: true } });
        return { value: agg._sum.netCents ?? 0, series: null };
      }
      case "orders.count.byStatus": {
        const rows = await prisma.order.groupBy({ by: ["status"], _count: { _all: true } });
        return { value: null, series: rows.map((r) => ({ label: r.status, value: r._count._all })) };
      }
      case "orders.count.byLieferstatus": {
        const rows = await prisma.order.groupBy({ by: ["lieferstatus"], _count: { _all: true } });
        return { value: null, series: rows.map((r) => ({ label: r.lieferstatus, value: r._count._all })) };
      }
      default:
        return { value: null, series: null };
    }
  }
}
