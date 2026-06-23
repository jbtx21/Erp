// In-Memory-Produktionsrepository für Unit-/Router-Tests.

import type {
  BomItemInput,
  OrderForProduction,
  ProductionRepository,
  ProductionStatus,
  SubOrderInput,
} from "../modules/production/production.service.js";

export class InMemoryProductionRepository implements ProductionRepository {
  private readonly orders = new Map<string, OrderForProduction>();
  private readonly meta = new Map<string, { finishingProfile: ProductionStatus["finishingProfile"]; dueDate: Date | null }>();
  private seq = 0;

  addOrder(order: OrderForProduction): void { this.orders.set(order.id, order); }

  async loadOrderForProduction(orderId: string): Promise<OrderForProduction | null> {
    return this.orders.get(orderId) ?? null;
  }

  readonly lastSubOrders = new Map<string, SubOrderInput[]>();

  async createProductionOrder(input: { number: string; orderId: string; dueDate: Date | null; finishingProfile: string | null; bomItems: BomItemInput[]; subOrders: SubOrderInput[] }): Promise<{ id: string }> {
    const id = `pa_${++this.seq}`;
    const o = this.orders.get(input.orderId);
    if (o) { o.existingProductionId = id; o.existingProductionNumber = input.number; }
    this.meta.set(input.orderId, { finishingProfile: input.finishingProfile as ProductionStatus["finishingProfile"], dueDate: input.dueDate });
    this.lastSubOrders.set(id, input.subOrders);
    return { id };
  }

  async setOrderInProduction(): Promise<void> { /* no-op im Speicher */ }

  async releaseOrder(orderId: string): Promise<void> {
    const o = this.orders.get(orderId);
    if (o) o.freigegeben = true;
  }

  async status(orderId: string): Promise<ProductionStatus | null> {
    const o = this.orders.get(orderId);
    if (!o) return null;
    const m = this.meta.get(orderId);
    return { freigegeben: o.freigegeben, productionId: o.existingProductionId, productionNumber: o.existingProductionNumber, finishingProfile: m?.finishingProfile ?? null, dueDate: m?.dueDate ?? null };
  }
}
