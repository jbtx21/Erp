// In-Memory-Reservierungen + Meldebestände für Unit-Tests/Dev.

import type { StockLager } from "@texma/shared";
import type {
  ReservationRepository,
  ReservationView,
  SupplyRow,
  ThresholdRecord,
} from "../modules/stock/reservation.service.js";

type ResStatus = "AKTIV" | "ERLEDIGT" | "STORNIERT";
interface MemRes {
  id: string;
  variantId: string;
  lager: StockLager;
  qty: number;
  orderId: string | null;
  belegRef: string | null;
  note: string | null;
  status: ResStatus;
  createdAt: Date;
}

export class InMemoryReservationRepository implements ReservationRepository {
  private readonly reservations = new Map<string, MemRes>();
  private readonly thresholds = new Map<string, ThresholdRecord>();
  private seq = 0;

  /** `meta`: variantId → {sku,name} für die Anzeige (Tests); `supply`: Bestell-/Einlager-Historie. */
  constructor(
    private readonly meta: Record<string, { sku: string; name: string }> = {},
    private readonly supply: SupplyRow[] = []
  ) {}

  private metaOf(variantId: string): { sku: string; name: string } {
    return this.meta[variantId] ?? { sku: variantId, name: variantId };
  }
  private tkey(variantId: string, lager: StockLager): string { return `${variantId}|${lager}`; }

  async createReservation(input: { variantId: string; lager: StockLager; qty: number; orderId: string | null; belegRef: string | null; note: string | null }): Promise<{ id: string }> {
    const id = `res_${++this.seq}`;
    this.reservations.set(id, { id, ...input, status: "AKTIV", createdAt: new Date() });
    return { id };
  }

  async releaseReservation(id: string, status: "ERLEDIGT" | "STORNIERT"): Promise<{ variantId: string; lager: StockLager } | null> {
    const r = this.reservations.get(id);
    if (!r || r.status !== "AKTIV") return null;
    r.status = status;
    return { variantId: r.variantId, lager: r.lager };
  }

  async releaseByOrder(orderId: string, status: "ERLEDIGT" | "STORNIERT"): Promise<Array<{ variantId: string; lager: StockLager }>> {
    const affected: Array<{ variantId: string; lager: StockLager }> = [];
    for (const r of this.reservations.values()) {
      if (r.orderId === orderId && r.status === "AKTIV") { r.status = status; affected.push({ variantId: r.variantId, lager: r.lager }); }
    }
    return affected;
  }

  async listReservations(filter: { variantId?: string; orderId?: string; status?: ResStatus; lager?: StockLager } = {}): Promise<ReservationView[]> {
    return [...this.reservations.values()]
      .filter((r) => (!filter.variantId || r.variantId === filter.variantId) && (!filter.orderId || r.orderId === filter.orderId) && (!filter.status || r.status === filter.status) && (!filter.lager || r.lager === filter.lager))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({ id: r.id, variantId: r.variantId, ...this.metaOf(r.variantId), lager: r.lager, qty: r.qty, orderId: r.orderId, belegRef: r.belegRef, note: r.note, status: r.status, createdAt: r.createdAt }));
  }

  async reservedMap(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const r of this.reservations.values()) if (r.status === "AKTIV") out[this.tkey(r.variantId, r.lager)] = (out[this.tkey(r.variantId, r.lager)] ?? 0) + r.qty;
    return out;
  }

  async reservedFor(variantId: string, lager: StockLager): Promise<number> {
    let sum = 0;
    for (const r of this.reservations.values()) if (r.status === "AKTIV" && r.variantId === variantId && r.lager === lager) sum += r.qty;
    return sum;
  }

  async listThresholds(): Promise<Array<ThresholdRecord & { sku: string; name: string }>> {
    return [...this.thresholds.values()].map((t) => ({ ...t, ...this.metaOf(t.variantId) }));
  }

  async getThreshold(variantId: string, lager: StockLager): Promise<ThresholdRecord | null> {
    const t = this.thresholds.get(this.tkey(variantId, lager));
    return t ? { ...t } : null;
  }

  async setThreshold(variantId: string, lager: StockLager, minQty: number): Promise<void> {
    const k = this.tkey(variantId, lager);
    const existing = this.thresholds.get(k);
    this.thresholds.set(k, { variantId, lager, minQty, alerting: existing?.alerting ?? false });
  }

  async removeThreshold(variantId: string, lager: StockLager): Promise<void> {
    this.thresholds.delete(this.tkey(variantId, lager));
  }

  async setAlerting(variantId: string, lager: StockLager, alerting: boolean): Promise<void> {
    const t = this.thresholds.get(this.tkey(variantId, lager));
    if (t) t.alerting = alerting;
  }

  async supplyTimeline(): Promise<SupplyRow[]> {
    return this.supply.map((r) => ({ ...r }));
  }

  private readonly puffers = new Map<string, number>();
  async shopPuffers(): Promise<Record<string, number>> {
    return Object.fromEntries([...this.puffers].filter(([, v]) => v > 0));
  }
  async setShopPuffer(variantId: string, puffer: number): Promise<void> {
    this.puffers.set(variantId, puffer);
  }
}
