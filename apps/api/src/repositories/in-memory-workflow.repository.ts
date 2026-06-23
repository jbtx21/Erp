// In-Memory-Workflow für Tests.

import type { OrderRoute } from "@texma/shared";
import type { WorkflowRepository } from "../modules/workflow/workflow.service.js";

interface MemOrder { id: string; hasVeredelung: boolean; hasIntern: boolean; hasExtern: boolean; route: OrderRoute | null; stepIndex: number }

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private orders = new Map<string, MemOrder>();
  seed(o: { id: string; hasVeredelung: boolean; hasIntern: boolean; hasExtern: boolean }): void {
    this.orders.set(o.id, { ...o, route: null, stepIndex: 0 });
  }
  async orderFlags(orderId: string): Promise<{ exists: boolean; hasVeredelung: boolean; hasIntern: boolean; hasExtern: boolean }> {
    const o = this.orders.get(orderId);
    return o ? { exists: true, hasVeredelung: o.hasVeredelung, hasIntern: o.hasIntern, hasExtern: o.hasExtern } : { exists: false, hasVeredelung: false, hasIntern: false, hasExtern: false };
  }
  async getRoute(orderId: string): Promise<{ route: OrderRoute | null; stepIndex: number } | null> {
    const o = this.orders.get(orderId);
    return o ? { route: o.route, stepIndex: o.stepIndex } : null;
  }
  async setRoute(orderId: string, route: OrderRoute, stepIndex: number): Promise<void> {
    const o = this.orders.get(orderId); if (o) { o.route = route; o.stepIndex = stepIndex; }
  }
  async setStepIndex(orderId: string, stepIndex: number): Promise<void> {
    const o = this.orders.get(orderId); if (o) o.stepIndex = stepIndex;
  }
}
