// In-Memory-Implementierung der Mehrfach-Teillieferung (Tests/Dev).

import type { FulfillmentStatus } from "@texma/shared";
import type {
  DeliveryLineInput,
  DeliveryNoteSummary,
  DeliveryRepository,
  OrderLineDelivery,
} from "../modules/delivery/delivery.service.js";

interface SeedLine { orderLineId: string; position: number; description: string; orderedQty: number }

export class InMemoryDeliveryRepository implements DeliveryRepository {
  private lines: SeedLine[] = [];
  private delivered = new Map<string, number>();
  private notes: (DeliveryNoteSummary & { orderId: string })[] = [];
  private seq = 0;
  lieferstatus: FulfillmentStatus | null = null;

  constructor(private readonly orderId: string = "o1", lines: SeedLine[] = []) {
    this.lines = lines;
    for (const l of lines) this.delivered.set(l.orderLineId, 0);
  }

  async orderExists(orderId: string): Promise<boolean> {
    return orderId === this.orderId;
  }
  async linesWithDelivered(): Promise<OrderLineDelivery[]> {
    return this.lines.map((l) => {
      const d = this.delivered.get(l.orderLineId) ?? 0;
      return { orderLineId: l.orderLineId, position: l.position, description: l.description, orderedQty: l.orderedQty, deliveredQty: d, remainingQty: l.orderedQty - d };
    });
  }
  async nextNumber(): Promise<string> {
    return `${this.orderId}-L${String(this.notes.length + 1)}`;
  }
  async createDeliveryNote(orderId: string, number: string, lines: DeliveryLineInput[]): Promise<{ id: string; number: string }> {
    for (const l of lines) this.delivered.set(l.orderLineId, (this.delivered.get(l.orderLineId) ?? 0) + l.qty);
    const id = `dn_${String(++this.seq)}`;
    this.notes.push({ id, number, createdAt: new Date(), lines: lines.map((l) => ({ orderLineId: l.orderLineId, qty: l.qty })), orderId });
    return { id, number };
  }
  async setOrderLieferstatus(_orderId: string, status: FulfillmentStatus): Promise<void> {
    this.lieferstatus = status;
  }
  async listDeliveryNotes(orderId: string): Promise<DeliveryNoteSummary[]> {
    return this.notes.filter((n) => n.orderId === orderId).map(({ orderId: _o, ...rest }) => rest);
  }
}
