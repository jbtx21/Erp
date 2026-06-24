// Reservierung/Verfügbarkeit + edge-getriggerte Meldebestand-Benachrichtigung.

import { describe, expect, it, beforeEach } from "vitest";
import type { StockLager } from "@texma/shared";
import { InMemoryReservationRepository } from "../../repositories/in-memory-reservation.repository.js";
import { ReservationError, ReservationService, type LowStockAlert, type OnHandPort } from "./reservation.service.js";

const meta = { v1: { sku: "TD-001", name: "Transfer Logo A" }, v2: { sku: "TD-002", name: "Transfer Logo B" } };

/** Veränderbarer On-Hand-Stub (statt echtem Ledger). */
class FakeOnHand implements OnHandPort {
  constructor(private readonly bal: Record<string, Partial<Record<StockLager, number>>>) {}
  async balance(variantId: string): Promise<Record<StockLager, number>> {
    const b = this.bal[variantId] ?? {};
    return { HAUPT: b.HAUPT ?? 0, MUSTER: b.MUSTER ?? 0, SHOWROOM: b.SHOWROOM ?? 0, TRANSFERDRUCK: b.TRANSFERDRUCK ?? 0 };
  }
  async listBalances() {
    return Object.entries(this.bal).map(([variantId, b]) => ({
      variantId, sku: meta[variantId as keyof typeof meta]?.sku ?? variantId, name: meta[variantId as keyof typeof meta]?.name ?? variantId,
      balances: { HAUPT: b.HAUPT ?? 0, MUSTER: b.MUSTER ?? 0, SHOWROOM: b.SHOWROOM ?? 0, TRANSFERDRUCK: b.TRANSFERDRUCK ?? 0 } as Record<StockLager, number>,
    }));
  }
}

describe("ReservationService", () => {
  let repo: InMemoryReservationRepository;
  let alerts: LowStockAlert[];
  let svc: ReservationService;

  beforeEach(() => {
    repo = new InMemoryReservationRepository(meta);
    alerts = [];
    const onHand = new FakeOnHand({ v1: { TRANSFERDRUCK: 100 }, v2: { TRANSFERDRUCK: 10 } });
    svc = new ReservationService(repo, onHand, { notify: async (a) => { alerts.push(a); } });
  });

  it("Reservierung senkt den verfügbaren Bestand (Ist − reserviert)", async () => {
    const r = await svc.reserve({ variantId: "v1", lager: "TRANSFERDRUCK", qty: 30, orderId: "ord-1", belegRef: "SO-2026-1" });
    expect(r.available).toBe(70);
    await svc.reserve({ variantId: "v1", lager: "TRANSFERDRUCK", qty: 20, orderId: "ord-2" });
    expect(await svc.availableFor("v1", "TRANSFERDRUCK")).toBe(50);
    // Stornieren gibt verfügbar wieder frei.
    await svc.release(r.id, "STORNIERT");
    expect(await svc.availableFor("v1", "TRANSFERDRUCK")).toBe(80);
  });

  it("validiert Menge", async () => {
    await expect(svc.reserve({ variantId: "v1", qty: 0 })).rejects.toBeInstanceOf(ReservationError);
    await expect(svc.reserve({ variantId: "v1", qty: -5 })).rejects.toBeInstanceOf(ReservationError);
  });

  it("meldet beim Unterschreiten des Meldebestands genau einmal pro Flanke", async () => {
    await svc.setThreshold("v1", "TRANSFERDRUCK", 80); // verfügbar 100 ≥ 80 → keine Meldung
    expect(alerts).toHaveLength(0);
    // Reservierung drückt verfügbar auf 70 < 80 → eine Meldung.
    await svc.reserve({ variantId: "v1", lager: "TRANSFERDRUCK", qty: 30, orderId: "ord-1" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ sku: "TD-001", lager: "TRANSFERDRUCK", available: 70, minQty: 80 });
    // Weitere Reservierung bleibt unter Schwelle → KEINE erneute Meldung (Flanke schon gesetzt).
    await svc.reserve({ variantId: "v1", lager: "TRANSFERDRUCK", qty: 10, orderId: "ord-2" });
    expect(alerts).toHaveLength(1);
    // checkLowStock erneut → ebenfalls keine Wiederholung.
    expect(await svc.checkLowStock()).toHaveLength(0);
  });

  it("Entwarnung setzt die Flanke zurück → neue Unterschreitung meldet wieder", async () => {
    await svc.setThreshold("v1", "TRANSFERDRUCK", 80);
    const r = await svc.reserve({ variantId: "v1", lager: "TRANSFERDRUCK", qty: 30 }); // verfügbar 70 → Meldung 1
    expect(alerts).toHaveLength(1);
    await svc.release(r.id, "STORNIERT"); // verfügbar 100 ≥ 80 → Entwarnung (alerting=false)
    await svc.reserve({ variantId: "v1", lager: "TRANSFERDRUCK", qty: 40 }); // verfügbar 60 < 80 → Meldung 2
    expect(alerts).toHaveLength(2);
  });

  it("setThreshold meldet sofort, wenn schon unterschritten", async () => {
    // v2 hat nur 10 Stück; Meldebestand 25 → sofortige Meldung.
    await svc.setThreshold("v2", "TRANSFERDRUCK", 25);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ variantId: "v2", available: 10, minQty: 25 });
  });

  it("availability() liefert Ist/reserviert/verfügbar + below-Flag", async () => {
    await svc.setThreshold("v2", "TRANSFERDRUCK", 25);
    await svc.reserve({ variantId: "v1", lager: "TRANSFERDRUCK", qty: 30 });
    const rows = await svc.availability();
    const v1 = rows.find((r) => r.variantId === "v1");
    const v2 = rows.find((r) => r.variantId === "v2");
    expect(v1).toMatchObject({ onHand: 100, reserved: 30, available: 70, below: false });
    expect(v2).toMatchObject({ onHand: 10, reserved: 0, available: 10, minQty: 25, below: true });
  });

  it("supplyTimeline berechnet unterwegs (bestellt − erhalten) und sortiert danach", async () => {
    const supply = [
      { variantId: "v1", sku: "TD-001", name: "A", orderedQty: 100, lastOrderedAt: new Date("2026-06-01"), receivedQty: 60, lastReceivedAt: new Date("2026-06-10"), unterwegs: 40 },
      { variantId: "v2", sku: "TD-002", name: "B", orderedQty: 50, lastOrderedAt: new Date("2026-06-05"), receivedQty: 50, lastReceivedAt: new Date("2026-06-12"), unterwegs: 0 },
    ];
    const s = new ReservationService(new InMemoryReservationRepository(meta, supply), new FakeOnHand({}));
    const rows = await s.supplyTimeline();
    expect(rows.map((r) => r.variantId)).toEqual(["v1", "v2"]); // unterwegs 40 vor 0
    expect(rows[0]).toMatchObject({ orderedQty: 100, receivedQty: 60, unterwegs: 40 });
  });

  it("releaseByOrder schließt alle Vormerkungen eines Auftrags", async () => {
    await svc.reserve({ variantId: "v1", lager: "TRANSFERDRUCK", qty: 10, orderId: "ord-9" });
    await svc.reserve({ variantId: "v2", lager: "TRANSFERDRUCK", qty: 5, orderId: "ord-9" });
    const n = await svc.releaseByOrder("ord-9", "ERLEDIGT");
    expect(n).toBe(2);
    expect(await svc.availableFor("v1", "TRANSFERDRUCK")).toBe(100);
    expect((await svc.listReservations({ orderId: "ord-9", status: "AKTIV" }))).toHaveLength(0);
  });
});
