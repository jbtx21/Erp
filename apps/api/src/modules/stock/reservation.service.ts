// Vormerkung/Reservierung gegen laufende Aufträge + verfügbarer Bestand + Meldebestand
// mit automatischer Benachrichtigung (Lücken-Scheibe 1 zum Lager).
//
//   verfügbar(Variante, Lager) = Ledger-Saldo − Σ AKTIVer Reservierungen
//
// Unterschreitet der VERFÜGBARE Bestand den Meldebestand (minQty), wird einmalig pro
// Flanke benachrichtigt (StockThreshold.alerting verhindert wiederholtes Spammen).
// Die On-Hand-Salden kommen aus dem bestehenden Bewegungs-Ledger (StockService).

import type { StockLager } from "@texma/shared";

export interface ReserveInput {
  variantId: string;
  lager?: StockLager;
  qty: number;
  orderId?: string | null;
  belegRef?: string | null;
  note?: string | null;
}

export interface ReservationView {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  lager: StockLager;
  qty: number;
  orderId: string | null;
  belegRef: string | null;
  note: string | null;
  status: "AKTIV" | "ERLEDIGT" | "STORNIERT";
  createdAt: Date;
}

export interface AvailabilityRow {
  variantId: string;
  sku: string;
  name: string;
  lager: StockLager;
  onHand: number;
  reserved: number;
  available: number;
  minQty: number | null;
  below: boolean;
}

export interface LowStockAlert {
  variantId: string;
  sku: string;
  name: string;
  lager: StockLager;
  available: number;
  minQty: number;
}

export interface ThresholdView {
  variantId: string;
  sku: string;
  name: string;
  lager: StockLager;
  minQty: number;
  alerting: boolean;
}

/** Persistierter Meldebestand (intern). */
export interface ThresholdRecord {
  variantId: string;
  lager: StockLager;
  minQty: number;
  alerting: boolean;
}

/** „Wann bestellt / wann eingelagert" je Artikel (Scheibe 2). */
export interface SupplyRow {
  variantId: string;
  sku: string;
  name: string;
  orderedQty: number;
  lastOrderedAt: Date | null;
  receivedQty: number;
  lastReceivedAt: Date | null;
  /** Noch nicht eingelagert (bestellt − erhalten, ≥ 0) = unterwegs. */
  unterwegs: number;
}

/** Empfänger der automatischen Meldung (Server bindet das an Benachrichtigungen). */
export interface LowStockNotifier {
  notify(alert: LowStockAlert): Promise<void>;
}

/** Liefert die On-Hand-Salden aus dem Bewegungs-Ledger (von StockService erfüllt). */
export interface OnHandPort {
  balance(variantId: string): Promise<Record<StockLager, number>>;
  listBalances(): Promise<Array<{ variantId: string; sku: string; name: string; balances: Record<StockLager, number> }>>;
}

export interface ReservationRepository {
  createReservation(input: { variantId: string; lager: StockLager; qty: number; orderId: string | null; belegRef: string | null; note: string | null }): Promise<{ id: string }>;
  /** Setzt eine Reservierung auf ERLEDIGT/STORNIERT; liefert die betroffene Variante×Lager. */
  releaseReservation(id: string, status: "ERLEDIGT" | "STORNIERT"): Promise<{ variantId: string; lager: StockLager } | null>;
  /** Schließt alle AKTIVen Reservierungen eines Auftrags; liefert betroffene Variante×Lager. */
  releaseByOrder(orderId: string, status: "ERLEDIGT" | "STORNIERT"): Promise<Array<{ variantId: string; lager: StockLager }>>;
  listReservations(filter?: { variantId?: string; orderId?: string; status?: "AKTIV" | "ERLEDIGT" | "STORNIERT"; lager?: StockLager }): Promise<ReservationView[]>;
  /** Summe AKTIVer Reservierungen je `${variantId}|${lager}`. */
  reservedMap(): Promise<Record<string, number>>;
  reservedFor(variantId: string, lager: StockLager): Promise<number>;
  listThresholds(): Promise<Array<ThresholdRecord & { sku: string; name: string }>>;
  getThreshold(variantId: string, lager: StockLager): Promise<ThresholdRecord | null>;
  setThreshold(variantId: string, lager: StockLager, minQty: number): Promise<void>;
  removeThreshold(variantId: string, lager: StockLager): Promise<void>;
  setAlerting(variantId: string, lager: StockLager, alerting: boolean): Promise<void>;
  /** Bestell-/Einlagerungs-Historie je Artikel (aus Bestellungen + Eingangsbelegen). */
  supplyTimeline(): Promise<SupplyRow[]>;
}

export class ReservationError extends Error {}

const key = (variantId: string, lager: StockLager): string => `${variantId}|${lager}`;

export class ReservationService {
  constructor(
    private readonly repo: ReservationRepository,
    private readonly onHand: OnHandPort,
    private readonly notifier: LowStockNotifier | null = null
  ) {}

  /** Merkt Bestand für einen Auftrag vor (reduziert den VERFÜGBAREN Bestand). */
  async reserve(input: ReserveInput): Promise<{ id: string; available: number }> {
    if (!input.variantId) throw new ReservationError("Variante ist Pflicht.");
    if (!Number.isInteger(input.qty) || input.qty <= 0) throw new ReservationError("Menge muss eine positive ganze Zahl sein.");
    const lager = input.lager ?? "HAUPT";
    const { id } = await this.repo.createReservation({
      variantId: input.variantId,
      lager,
      qty: input.qty,
      orderId: input.orderId ?? null,
      belegRef: input.belegRef?.trim() || null,
      note: input.note?.trim() || null,
    });
    await this.checkFor(input.variantId, lager);
    return { id, available: await this.availableFor(input.variantId, lager) };
  }

  /** Hebt eine Reservierung auf (Standard: STORNIERT; ERLEDIGT bei Überführung in Verbrauch). */
  async release(id: string, status: "ERLEDIGT" | "STORNIERT" = "STORNIERT"): Promise<void> {
    const affected = await this.repo.releaseReservation(id, status);
    if (affected) await this.checkFor(affected.variantId, affected.lager);
  }

  /** Schließt alle Vormerkungen eines Auftrags (z. B. bei Lieferung/Storno). */
  async releaseByOrder(orderId: string, status: "ERLEDIGT" | "STORNIERT" = "ERLEDIGT"): Promise<number> {
    const affected = await this.repo.releaseByOrder(orderId, status);
    const seen = new Set<string>();
    for (const a of affected) {
      const k = key(a.variantId, a.lager);
      if (!seen.has(k)) { seen.add(k); await this.checkFor(a.variantId, a.lager); }
    }
    return affected.length;
  }

  listReservations(filter?: { variantId?: string; orderId?: string; status?: "AKTIV" | "ERLEDIGT" | "STORNIERT"; lager?: StockLager }): Promise<ReservationView[]> {
    return this.repo.listReservations(filter);
  }

  /** „Wann bestellt / wann eingelagert" je Artikel (Scheibe 2) — sortiert nach unterwegs. */
  async supplyTimeline(): Promise<SupplyRow[]> {
    const rows = await this.repo.supplyTimeline();
    return rows.sort((a, b) => b.unterwegs - a.unterwegs || a.sku.localeCompare(b.sku));
  }

  /** Verfügbarer Bestand (Ist − reserviert) für eine Variante×Lager. */
  async availableFor(variantId: string, lager: StockLager): Promise<number> {
    const [bal, reserved] = await Promise.all([this.onHand.balance(variantId), this.repo.reservedFor(variantId, lager)]);
    return (bal[lager] ?? 0) - reserved;
  }

  /** Verfügbarkeits-Übersicht je Variante×Lager (Ist/reserviert/verfügbar + Meldebestand). */
  async availability(): Promise<AvailabilityRow[]> {
    const [balances, reservedMap, thresholds] = await Promise.all([
      this.onHand.listBalances(),
      this.repo.reservedMap(),
      this.repo.listThresholds(),
    ]);
    const minByKey = new Map(thresholds.map((t) => [key(t.variantId, t.lager), t.minQty]));
    const lagers: StockLager[] = ["HAUPT", "MUSTER", "SHOWROOM", "TRANSFERDRUCK"];
    const rows: AvailabilityRow[] = [];
    for (const b of balances) {
      for (const lager of lagers) {
        const onHandQty = b.balances[lager] ?? 0;
        const reserved = reservedMap[key(b.variantId, lager)] ?? 0;
        const minQty = minByKey.get(key(b.variantId, lager)) ?? null;
        if (onHandQty === 0 && reserved === 0 && minQty == null) continue; // nur relevante Zeilen
        const available = onHandQty - reserved;
        rows.push({ variantId: b.variantId, sku: b.sku, name: b.name, lager, onHand: onHandQty, reserved, available, minQty, below: minQty != null && available < minQty });
      }
    }
    return rows;
  }

  // ── Meldebestände ─────────────────────────────────────────────────────────
  listThresholds(): Promise<Array<ThresholdView>> {
    return this.repo.listThresholds().then((ts) => ts.map((t) => ({ variantId: t.variantId, sku: t.sku, name: t.name, lager: t.lager, minQty: t.minQty, alerting: t.alerting })));
  }

  /** Setzt/entfernt den Meldebestand (minQty ≤ 0 entfernt ihn) und prüft sofort. */
  async setThreshold(variantId: string, lager: StockLager, minQty: number): Promise<void> {
    if (!variantId) throw new ReservationError("Variante ist Pflicht.");
    if (!Number.isInteger(minQty)) throw new ReservationError("Meldebestand muss eine ganze Zahl sein.");
    if (minQty <= 0) { await this.repo.removeThreshold(variantId, lager); return; }
    await this.repo.setThreshold(variantId, lager, minQty);
    await this.checkFor(variantId, lager);
  }

  /**
   * Prüft alle Meldebestände und benachrichtigt bei NEU unterschrittenem verfügbaren
   * Bestand (Flankensteuerung über `alerting`). Liefert die ausgelösten Meldungen.
   * Für Cron/manuelles Auslösen.
   */
  async checkLowStock(): Promise<LowStockAlert[]> {
    const [thresholds, balances, reservedMap] = await Promise.all([
      this.repo.listThresholds(),
      this.onHand.listBalances(),
      this.repo.reservedMap(),
    ]);
    const balByKey = new Map<string, { sku: string; name: string; onHand: number }>();
    for (const b of balances) for (const [lager, qty] of Object.entries(b.balances)) balByKey.set(key(b.variantId, lager as StockLager), { sku: b.sku, name: b.name, onHand: qty });
    const alerts: LowStockAlert[] = [];
    for (const t of thresholds) {
      const meta = balByKey.get(key(t.variantId, t.lager));
      const onHandQty = meta?.onHand ?? 0;
      const available = onHandQty - (reservedMap[key(t.variantId, t.lager)] ?? 0);
      const below = available < t.minQty;
      if (below && !t.alerting) {
        const alert: LowStockAlert = { variantId: t.variantId, sku: t.sku, name: t.name, lager: t.lager, available, minQty: t.minQty };
        await this.repo.setAlerting(t.variantId, t.lager, true);
        if (this.notifier) await this.notifier.notify(alert);
        alerts.push(alert);
      } else if (!below && t.alerting) {
        await this.repo.setAlerting(t.variantId, t.lager, false); // Entwarnung
      }
    }
    return alerts;
  }

  /** Prüft den Meldebestand einer einzelnen Variante×Lager (nach Reservierung/Buchung). */
  private async checkFor(variantId: string, lager: StockLager): Promise<void> {
    const t = await this.repo.getThreshold(variantId, lager);
    if (!t) return;
    const available = await this.availableFor(variantId, lager);
    const below = available < t.minQty;
    if (below && !t.alerting) {
      await this.repo.setAlerting(variantId, lager, true);
      if (this.notifier) {
        const meta = await this.metaFor(variantId);
        await this.notifier.notify({ variantId, sku: meta.sku, name: meta.name, lager, available, minQty: t.minQty });
      }
    } else if (!below && t.alerting) {
      await this.repo.setAlerting(variantId, lager, false);
    }
  }

  private async metaFor(variantId: string): Promise<{ sku: string; name: string }> {
    const ts = await this.repo.listThresholds();
    const hit = ts.find((t) => t.variantId === variantId);
    return hit ? { sku: hit.sku, name: hit.name } : { sku: variantId, name: variantId };
  }
}
