// Mehrfach-Teillieferung (Remodel zu G-4): Lieferscheine mit Zeilenmengen je
// Auftragsposition. Mehrere Lieferscheine pro Auftrag möglich; Überlieferung wird
// blockiert; der Lieferstatus wird aus gelieferter vs. bestellter Menge real abgeleitet.

import { fulfillmentStatus, type FulfillmentStatus } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface DeliveryLineInput {
  orderLineId: string;
  qty: number;
}

export interface OrderLineDelivery {
  orderLineId: string;
  position: number;
  description: string;
  orderedQty: number;
  deliveredQty: number;
  remainingQty: number;
}

export interface DeliveryNoteSummary {
  id: string;
  number: string;
  createdAt: Date;
  lines: { orderLineId: string; qty: number }[];
}

export interface DeliveryRepository {
  orderExists(orderId: string): Promise<boolean>;
  /** Auftragspositionen mit bereits gelieferter Menge (Summe über alle Lieferscheine). */
  linesWithDelivered(orderId: string): Promise<OrderLineDelivery[]>;
  nextNumber(orderId: string): Promise<string>;
  createDeliveryNote(orderId: string, number: string, lines: DeliveryLineInput[]): Promise<{ id: string; number: string }>;
  setOrderLieferstatus(orderId: string, status: FulfillmentStatus): Promise<void>;
  listDeliveryNotes(orderId: string): Promise<DeliveryNoteSummary[]>;
}

export class DeliveryError extends Error {}

export class DeliveryService {
  constructor(
    private readonly repo: DeliveryRepository,
    private readonly audit: AuditSink
  ) {}

  /** Restmengen je Position (für die Erfassungsmaske). */
  async remaining(orderId: string): Promise<OrderLineDelivery[]> {
    if (!(await this.repo.orderExists(orderId))) throw new DeliveryError(`Auftrag ${orderId} nicht gefunden.`);
    return this.repo.linesWithDelivered(orderId);
  }

  listDeliveryNotes(orderId: string): Promise<DeliveryNoteSummary[]> {
    return this.repo.listDeliveryNotes(orderId);
  }

  /**
   * Erstellt einen (Teil-)Lieferschein. Validiert: Menge > 0, Position gehört zum
   * Auftrag, keine Überlieferung (qty ≤ Restmenge). Danach Lieferstatus real ableiten.
   */
  async createDeliveryNote(orderId: string, lines: DeliveryLineInput[]): Promise<{ id: string; number: string; lieferstatus: FulfillmentStatus }> {
    if (!(await this.repo.orderExists(orderId))) throw new DeliveryError(`Auftrag ${orderId} nicht gefunden.`);
    const current = await this.repo.linesWithDelivered(orderId);
    const byId = new Map(current.map((l) => [l.orderLineId, l]));
    const clean = lines.filter((l) => l.qty > 0);
    if (clean.length === 0) throw new DeliveryError("Keine Liefermenge angegeben.");
    for (const l of clean) {
      const c = byId.get(l.orderLineId);
      if (!c) throw new DeliveryError(`Position ${l.orderLineId} gehört nicht zum Auftrag.`);
      if (l.qty > c.remainingQty) throw new DeliveryError(`Position ${String(c.position)}: Liefermenge ${String(l.qty)} überschreitet Restmenge ${String(c.remainingQty)}.`);
    }

    const number = await this.repo.nextNumber(orderId);
    const dn = await this.repo.createDeliveryNote(orderId, number, clean);

    const after = await this.repo.linesWithDelivered(orderId);
    const ordered = after.reduce((s, l) => s + l.orderedQty, 0);
    const delivered = after.reduce((s, l) => s + l.deliveredQty, 0);
    const lieferstatus = fulfillmentStatus(ordered, delivered);
    await this.repo.setOrderLieferstatus(orderId, lieferstatus);

    await this.audit.append(buildEntry({ entity: "DeliveryNote", entityId: dn.id, action: "CREATE", after: { orderId, number, lines: clean, lieferstatus } }));
    return { id: dn.id, number: dn.number, lieferstatus };
  }

  /**
   * Liefert alle noch offenen Restmengen in EINEM Lieferschein (Voll-Lieferung). Wird beim
   * Statuswechsel → VERSENDET ausgelöst, damit Versand real einen Lieferschein + Bestands-
   * abgang + `lieferstatus` erzeugt (keine „versendet ohne Lieferung"-Inkonsistenz mehr).
   * Gibt null zurück, wenn nichts mehr offen ist (alles bereits geliefert).
   */
  async deliverRemaining(orderId: string): Promise<{ id: string; number: string; lieferstatus: FulfillmentStatus } | null> {
    const rem = await this.remaining(orderId);
    const lines = rem.filter((l) => l.remainingQty > 0).map((l) => ({ orderLineId: l.orderLineId, qty: l.remainingQty }));
    if (lines.length === 0) return null;
    return this.createDeliveryNote(orderId, lines);
  }
}
