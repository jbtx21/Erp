// Transferdruck-Bezug für die Inhouse-Veredelung (Kap. 5.4/11): bestandsgeführte
// Transferartikel eines Auftrags werden — soweit verfügbar — aus dem Lager TRANSFERDRUCK
// reserviert; die Fehlmenge wird beim hinterlegten Material-Lieferanten nachbestellt.
// Reine Entscheidungslogik in @texma/shared; hier die Orchestrierung (Reservierung + PO).

import { buildEntry, type AuditSink } from "@texma/audit";
import { groupTransferPurchases, planTransferSourcing, type TransferNeed, type TransferSourcingLine } from "@texma/shared";
import type { ReservationService } from "../stock/reservation.service.js";
import type { ReorderRepository } from "../reorder/reorder.service.js";

/** Bedarf ohne Verfügbarkeit — die ergänzt der Service aus dem Lager TRANSFERDRUCK. */
export type TransferNeedInput = Omit<TransferNeed, "available">;

export interface TransferSourcingRepository {
  /** Bestandsgeführte Transfer-Veredelungspositionen eines Auftrags (Bedarf + Material-Lieferant). */
  transferNeedsForOrder(orderId: string): Promise<TransferNeedInput[]>;
}

export interface TransferSourcingResult {
  /** Bezugsplan je Transferartikel (Lager-Anteil + Bestellmenge). */
  lines: TransferSourcingLine[];
  /** Aus dem Lager reservierte Positionen. */
  reserved: Array<{ variantId: string; qty: number; reservationId: string }>;
  /** Erzeugte Nachbestellungen (PO-Nummern je Lieferant). */
  orders: Array<{ supplierId: string; number: string; lineCount: number }>;
  /** Bestellbedürftige Positionen ohne hinterlegten Material-Lieferanten (Klärung). */
  ohneLieferant: TransferSourcingLine[];
}

export class TransferSourcingError extends Error {}

export class TransferSourcingService {
  constructor(
    private readonly repo: TransferSourcingRepository,
    private readonly reservations: ReservationService,
    private readonly reorderRepo: ReorderRepository,
    private readonly audit: AuditSink
  ) {}

  /** Bezugsplan (ohne Buchung): zeigt je Transferartikel Bedarf/verfügbar/Lager/Bestellung. */
  async preview(orderId: string): Promise<TransferSourcingLine[]> {
    const needs = await this.repo.transferNeedsForOrder(orderId);
    const withAvail: TransferNeed[] = await Promise.all(
      needs.map(async (n) => ({ ...n, available: await this.reservations.availableFor(n.variantId, "TRANSFERDRUCK") }))
    );
    return planTransferSourcing(withAvail);
  }

  /**
   * Stößt den Bezug an: reserviert die verfügbaren Mengen aus dem Lager TRANSFERDRUCK und
   * erzeugt für die Fehlmengen Bestellungen beim hinterlegten Material-Lieferanten.
   */
  async source(orderId: string): Promise<TransferSourcingResult> {
    const lines = await this.preview(orderId);
    if (lines.length === 0) throw new TransferSourcingError("Keine bestandsgeführten Transferdrucke an diesem Auftrag.");

    // 1) Lager-Anteil reservieren (verfügbarer Bestand TRANSFERDRUCK).
    const reserved: TransferSourcingResult["reserved"] = [];
    for (const l of lines) {
      if (l.fromStock <= 0) continue;
      const r = await this.reservations.reserve({ variantId: l.variantId, lager: "TRANSFERDRUCK", qty: l.fromStock, orderId, note: "Transferdruck-Bezug" });
      reserved.push({ variantId: l.variantId, qty: l.fromStock, reservationId: r.id });
    }

    // 2) Fehlmengen je Material-Lieferant nachbestellen.
    const { groups, ohneLieferant } = groupTransferPurchases(lines);
    const created = groups.length > 0
      ? await this.reorderRepo.createPurchaseOrders(groups.map((g) => ({
          supplierId: g.supplierId,
          lines: g.lines.map((l) => ({ variantId: l.variantId, supplierId: g.supplierId, orderQty: l.orderQty, ekCents: l.ekCents ?? 0 })),
          totalEkCents: g.lines.reduce((s, l) => s + l.orderQty * (l.ekCents ?? 0), 0),
        })))
      : [];
    const orders = created.map((po, i) => ({ supplierId: groups[i]!.supplierId, number: po.number, lineCount: groups[i]!.lines.length }));

    await this.audit.append(buildEntry({
      entity: "Order", entityId: orderId, action: "UPDATE",
      after: { transferdruckBezug: { reserviert: reserved.length, bestellungen: orders.length, ohneLieferant: ohneLieferant.length } },
    }));

    return { lines, reserved, orders, ohneLieferant };
  }
}
