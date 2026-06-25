import type { AbschlagRecord, AbschlagRepository, OrderForAbschlag } from "../modules/abschlag/abschlag.service.js";

let seq = 0;

/** In-Memory-Abschlag-Repo für Tests; Aufträge werden über `seedOrder` hinterlegt. */
export class InMemoryAbschlagRepository implements AbschlagRepository {
  private readonly orders = new Map<string, OrderForAbschlag>();
  private readonly rows: AbschlagRecord[] = [];

  seedOrder(o: OrderForAbschlag): void {
    this.orders.set(o.id, o);
  }

  async loadOrderForAbschlag(orderId: string): Promise<OrderForAbschlag | null> {
    return this.orders.get(orderId) ?? null;
  }
  async listForOrder(orderId: string): Promise<AbschlagRecord[]> {
    return this.rows.filter((r) => r.orderId === orderId).map((r) => ({ ...r }));
  }
  async create(input: Omit<AbschlagRecord, "id" | "issuedAt" | "bezahlt">): Promise<AbschlagRecord> {
    const rec: AbschlagRecord = { ...input, id: `ar-${++seq}`, bezahlt: false, issuedAt: new Date(0) };
    this.rows.push(rec);
    return { ...rec };
  }
  async setBezahlt(id: string, bezahlt: boolean): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.bezahlt = bezahlt;
  }
}
