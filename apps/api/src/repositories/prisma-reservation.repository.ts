// Prisma-Implementierung der Reservierungen + Meldebestände.

import { prisma } from "@texma/db";
import type { StockLager } from "@texma/shared";
import type {
  ReservationRepository,
  ReservationView,
  SupplyRow,
  ThresholdRecord,
} from "../modules/stock/reservation.service.js";

type ResStatus = "AKTIV" | "ERLEDIGT" | "STORNIERT";
const metaSelect = { id: true, sku: true, article: { select: { name: true } } } as const;

export class PrismaReservationRepository implements ReservationRepository {
  async createReservation(input: { variantId: string; lager: StockLager; qty: number; orderId: string | null; belegRef: string | null; note: string | null }): Promise<{ id: string }> {
    const variant = await prisma.variant.findUnique({ where: { id: input.variantId }, select: { id: true } });
    if (!variant) throw new Error(`Variante „${input.variantId}" nicht gefunden — bitte eine gültige Varianten-ID/SKU verwenden.`);
    // Multi-Lager Stufe 2a: warehouseId parallel mitschreiben (Seed-Mapping, Migration 0075).
    return prisma.stockReservation.create({ data: { ...input, warehouseId: `wh_${input.lager.toLowerCase()}` }, select: { id: true } });
  }

  async releaseReservation(id: string, status: "ERLEDIGT" | "STORNIERT"): Promise<{ variantId: string; lager: StockLager } | null> {
    const existing = await prisma.stockReservation.findUnique({ where: { id }, select: { variantId: true, lager: true, status: true } });
    if (!existing || existing.status !== "AKTIV") return null;
    await prisma.stockReservation.update({ where: { id }, data: { status, releasedAt: new Date() } });
    return { variantId: existing.variantId, lager: existing.lager as StockLager };
  }

  async releaseByOrder(orderId: string, status: "ERLEDIGT" | "STORNIERT"): Promise<Array<{ variantId: string; lager: StockLager }>> {
    const affected = await prisma.stockReservation.findMany({ where: { orderId, status: "AKTIV" }, select: { variantId: true, lager: true } });
    if (affected.length > 0) await prisma.stockReservation.updateMany({ where: { orderId, status: "AKTIV" }, data: { status, releasedAt: new Date() } });
    return affected.map((a) => ({ variantId: a.variantId, lager: a.lager as StockLager }));
  }

  async listReservations(filter: { variantId?: string; orderId?: string; status?: ResStatus; lager?: StockLager } = {}): Promise<ReservationView[]> {
    const rows = await prisma.stockReservation.findMany({
      where: { variantId: filter.variantId, orderId: filter.orderId, status: filter.status, lager: filter.lager },
      orderBy: { createdAt: "desc" },
      include: { variant: { select: metaSelect } },
    });
    return rows.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      sku: r.variant.sku,
      name: r.variant.article.name,
      lager: r.lager as StockLager,
      qty: r.qty,
      orderId: r.orderId,
      belegRef: r.belegRef,
      note: r.note,
      status: r.status as ResStatus,
      createdAt: r.createdAt,
    }));
  }

  async reservedMap(): Promise<Record<string, number>> {
    const grouped = await prisma.stockReservation.groupBy({ by: ["variantId", "lager"], where: { status: "AKTIV" }, _sum: { qty: true } });
    const out: Record<string, number> = {};
    for (const g of grouped) out[`${g.variantId}|${g.lager}`] = g._sum.qty ?? 0;
    return out;
  }

  async reservedFor(variantId: string, lager: StockLager): Promise<number> {
    const agg = await prisma.stockReservation.aggregate({ where: { variantId, lager, status: "AKTIV" }, _sum: { qty: true } });
    return agg._sum.qty ?? 0;
  }

  async listThresholds(): Promise<Array<ThresholdRecord & { sku: string; name: string }>> {
    const rows = await prisma.stockThreshold.findMany({ include: { variant: { select: metaSelect } }, orderBy: { updatedAt: "desc" } });
    return rows.map((t) => ({ variantId: t.variantId, lager: t.lager as StockLager, minQty: t.minQty, alerting: t.alerting, sku: t.variant.sku, name: t.variant.article.name }));
  }

  async getThreshold(variantId: string, lager: StockLager): Promise<ThresholdRecord | null> {
    const t = await prisma.stockThreshold.findUnique({ where: { variantId_lager: { variantId, lager } }, select: { variantId: true, lager: true, minQty: true, alerting: true } });
    return t ? { variantId: t.variantId, lager: t.lager as StockLager, minQty: t.minQty, alerting: t.alerting } : null;
  }

  async setThreshold(variantId: string, lager: StockLager, minQty: number): Promise<void> {
    await prisma.stockThreshold.upsert({
      where: { variantId_lager: { variantId, lager } },
      create: { variantId, lager, minQty },
      update: { minQty },
    });
  }

  async removeThreshold(variantId: string, lager: StockLager): Promise<void> {
    await prisma.stockThreshold.deleteMany({ where: { variantId, lager } });
  }

  async setAlerting(variantId: string, lager: StockLager, alerting: boolean): Promise<void> {
    await prisma.stockThreshold.updateMany({ where: { variantId, lager }, data: { alerting } });
  }

  async supplyTimeline(): Promise<SupplyRow[]> {
    // Bestellt = Positionen aus tatsächlich abgesetzten Bestellungen (nicht ENTWURF).
    const orderLines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { status: { in: ["BESTELLT", "TEILWEISE_ERHALTEN", "ERHALTEN"] } } },
      select: { variantId: true, qty: true, purchaseOrder: { select: { createdAt: true } }, variant: { select: metaSelect } },
    });
    const grLines = await prisma.goodsReceiptLine.findMany({
      select: { variantId: true, receivedQty: true, goodsReceipt: { select: { receivedAt: true } }, variant: { select: metaSelect } },
    });
    const map = new Map<string, SupplyRow>();
    const ensure = (variantId: string, sku: string, name: string): SupplyRow => {
      let r = map.get(variantId);
      if (!r) { r = { variantId, sku, name, orderedQty: 0, lastOrderedAt: null, receivedQty: 0, lastReceivedAt: null, unterwegs: 0 }; map.set(variantId, r); }
      return r;
    };
    for (const l of orderLines) {
      const r = ensure(l.variantId, l.variant.sku, l.variant.article.name);
      r.orderedQty += l.qty;
      if (!r.lastOrderedAt || l.purchaseOrder.createdAt > r.lastOrderedAt) r.lastOrderedAt = l.purchaseOrder.createdAt;
    }
    for (const l of grLines) {
      const r = ensure(l.variantId, l.variant.sku, l.variant.article.name);
      r.receivedQty += l.receivedQty;
      if (!r.lastReceivedAt || l.goodsReceipt.receivedAt > r.lastReceivedAt) r.lastReceivedAt = l.goodsReceipt.receivedAt;
    }
    for (const r of map.values()) r.unterwegs = Math.max(0, r.orderedQty - r.receivedQty);
    return [...map.values()];
  }

  async shopPuffers(): Promise<Record<string, number>> {
    const rows = await prisma.variant.findMany({ where: { shopPuffer: { gt: 0 } }, select: { id: true, shopPuffer: true } });
    return Object.fromEntries(rows.map((r) => [r.id, r.shopPuffer]));
  }

  async setShopPuffer(variantId: string, puffer: number): Promise<void> {
    await prisma.variant.update({ where: { id: variantId }, data: { shopPuffer: puffer } });
  }

  async isStockManaged(variantId: string): Promise<boolean> {
    const v = await prisma.variant.findUnique({ where: { id: variantId }, select: { bestandsgefuehrtOverride: true, article: { select: { bestandsgefuehrt: true } } } });
    if (!v) return false;
    return v.bestandsgefuehrtOverride ?? v.article.bestandsgefuehrt;
  }

  async stockManagedVariantIds(): Promise<Set<string>> {
    // Bestandsgeführt = Override true, ODER (Override null UND Hauptartikel bestandsgeführt).
    const rows = await prisma.variant.findMany({
      where: { OR: [{ bestandsgefuehrtOverride: true }, { bestandsgefuehrtOverride: null, article: { bestandsgefuehrt: true } }] },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
}
