// In-Memory-Continuity-Repository für Unit-Tests/Dev.

import type { OfflineBundleOrder } from "@texma/shared";
import type {
  ContinuityRepository,
  ProductionFeedback,
} from "../modules/continuity/continuity.service.js";

export class InMemoryContinuityRepository implements ContinuityRepository {
  private orders: OfflineBundleOrder[] = [];
  private readonly byKey = new Map<string, string>();
  private seq = 0;

  setOpenOrders(orders: OfflineBundleOrder[]): void {
    this.orders = orders;
  }

  async openBundleOrders(): Promise<OfflineBundleOrder[]> {
    return [...this.orders];
  }

  async recordFeedback(fb: ProductionFeedback): Promise<{ id: string; created: boolean }> {
    const existing = this.byKey.get(fb.idempotencyKey);
    if (existing) return { id: existing, created: false };
    const id = `te-${++this.seq}`;
    this.byKey.set(fb.idempotencyKey, id);
    return { id, created: true };
  }
}
