// Prisma-Implementierung der Sammelbestellung (Kap. 18.2). Find-or-create der Periode
// (Unique shopConnectorId+periodStart), Anhängen der Mitglieds-Aufträge und Bündelungs-
// Eingaben (Positionen aller Mitglieder mit Varianten-Label).

import { prisma } from "@texma/db";
import type { BundleInputLine, PositionKind } from "@texma/shared";
import type {
  CollectiveOrderDetail,
  CollectiveOrderRow,
  OrderShopMode,
  SammelbestellungRepository,
} from "../modules/sammelbestellung/sammelbestellung.service.js";

function variantLabel(v: { sku: string; article: { name: string }; attributes: { name: string; value: string }[] } | null, description: string): string {
  if (!v) return description;
  const farbe = v.attributes.find((a) => a.name === "Farbe")?.value;
  const groesse = v.attributes.find((a) => a.name === "Größe")?.value;
  const suffix = [farbe, groesse].filter(Boolean).join(" / ");
  return suffix ? `${v.article.name} (${suffix})` : `${v.article.name} (${v.sku})`;
}

export class PrismaSammelbestellungRepository implements SammelbestellungRepository {
  async loadOrderShopMode(orderId: string): Promise<OrderShopMode | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { companyId: true, shopConnector: { select: { id: true, bestellmodus: true, sammelInterval: true } } },
    });
    if (!o?.shopConnector) return null;
    return { shopConnectorId: o.shopConnector.id, companyId: o.companyId, bestellmodus: o.shopConnector.bestellmodus, sammelInterval: o.shopConnector.sammelInterval };
  }

  async ensureCollective(input: { shopConnectorId: string; companyId: string; interval: string; periodStart: Date; periodEnd: Date }): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.collectiveOrder.findUnique({
        where: { shopConnectorId_periodStart: { shopConnectorId: input.shopConnectorId, periodStart: input.periodStart } },
        select: { id: true },
      });
      if (existing) return existing;
      const count = await tx.collectiveOrder.count();
      const number = `SB-${input.periodStart.getUTCFullYear()}-${String(count + 1).padStart(4, "0")}`;
      return tx.collectiveOrder.create({
        data: { number, shopConnectorId: input.shopConnectorId, companyId: input.companyId, interval: input.interval, periodStart: input.periodStart, periodEnd: input.periodEnd, status: "OFFEN" },
        select: { id: true },
      });
    });
  }

  async attachOrderToCollective(orderId: string, collectiveOrderId: string): Promise<void> {
    await prisma.order.update({ where: { id: orderId }, data: { collectiveOrderId } });
  }

  async list(): Promise<CollectiveOrderRow[]> {
    const rows = await prisma.collectiveOrder.findMany({
      orderBy: { periodStart: "desc" },
      select: {
        id: true, number: true, interval: true, periodStart: true, periodEnd: true, status: true,
        shopConnector: { select: { name: true } }, company: { select: { name: true } },
        _count: { select: { orders: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id, number: r.number, shopName: r.shopConnector.name, companyName: r.company.name,
      interval: r.interval, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, orderCount: r._count.orders,
    }));
  }

  async detailMeta(id: string): Promise<CollectiveOrderRow | null> {
    const r = await prisma.collectiveOrder.findUnique({
      where: { id },
      select: {
        id: true, number: true, interval: true, periodStart: true, periodEnd: true, status: true,
        shopConnector: { select: { name: true } }, company: { select: { name: true } }, _count: { select: { orders: true } },
      },
    });
    if (!r) return null;
    return { id: r.id, number: r.number, shopName: r.shopConnector.name, companyName: r.company.name, interval: r.interval, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, orderCount: r._count.orders };
  }

  async detailLines(id: string): Promise<{ lines: BundleInputLine[]; orders: CollectiveOrderDetail["orders"] }> {
    const orders = await prisma.order.findMany({
      where: { collectiveOrderId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, number: true, employeeNote: true,
        lines: { select: { description: true, qty: true, kind: true, variantId: true } },
      },
    });
    // OrderLine hat keine Variant-Relation → Varianten-Stammdaten separat laden und mappen.
    const variantIds = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.variantId).filter((v): v is string => v !== null)))];
    const variants = variantIds.length > 0
      ? await prisma.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, article: { select: { name: true } }, attributes: { select: { name: true, value: true } } } })
      : [];
    const vmap = new Map(variants.map((v) => [v.id, v]));
    const lines: BundleInputLine[] = orders.flatMap((o) =>
      o.lines.map((l) => ({
        kind: l.kind as PositionKind,
        key: l.variantId ?? l.description,
        label: variantLabel(l.variantId ? vmap.get(l.variantId) ?? null : null, l.description),
        qty: l.qty,
      }))
    );
    return { lines, orders: orders.map((o) => ({ id: o.id, number: o.number, employeeNote: o.employeeNote, lineCount: o.lines.length })) };
  }

  async setStatus(id: string, status: "OFFEN" | "GEBUENDELT" | "UMGESETZT", closedAt: Date | null): Promise<void> {
    await prisma.collectiveOrder.update({ where: { id }, data: { status, closedAt } });
  }

  async listShops(): Promise<import("../modules/sammelbestellung/sammelbestellung.service.js").ShopModeRow[]> {
    const rows = await prisma.shopConnector.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, bestellmodus: true, sammelInterval: true, company: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, companyName: r.company.name, bestellmodus: r.bestellmodus, sammelInterval: r.sammelInterval }));
  }

  async setShopMode(shopId: string, bestellmodus: string, sammelInterval: string | null): Promise<void> {
    await prisma.shopConnector.update({ where: { id: shopId }, data: { bestellmodus, sammelInterval } });
  }
}
