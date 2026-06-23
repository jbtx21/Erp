import { describe, expect, it } from "vitest";
import { ProductionError, ProductionService, type OrderForProduction, type ProductionRepository } from "./production.service.js";
import { NumberingService } from "../numbering/numbering.service.js";
import { InMemoryNumberingRepository } from "../../repositories/in-memory-numbering.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

class FakeRepo implements ProductionRepository {
  created: { number: string; orderId: string; dueDate: Date | null; bomItems: { description: string; qty: number; variantId: string | null }[] }[] = [];
  inProduction: string[] = [];
  released: string[] = [];
  constructor(private order: OrderForProduction | null) {}
  async loadOrderForProduction(): Promise<OrderForProduction | null> { return this.order; }
  async createProductionOrder(input: { number: string; orderId: string; dueDate: Date | null; bomItems: { description: string; qty: number; variantId: string | null }[] }): Promise<{ id: string }> {
    this.created.push({ number: input.number, orderId: input.orderId, dueDate: input.dueDate, bomItems: input.bomItems });
    if (this.order) this.order = { ...this.order, existingProductionId: "pa_1", existingProductionNumber: input.number };
    return { id: "pa_1" };
  }
  async setOrderInProduction(orderId: string): Promise<void> { this.inProduction.push(orderId); }
  async releaseOrder(orderId: string): Promise<void> { this.released.push(orderId); if (this.order) this.order = { ...this.order, freigegeben: true }; }
  async status(): Promise<{ freigegeben: boolean; productionId: string | null; productionNumber: string | null } | null> {
    return this.order ? { freigegeben: this.order.freigegeben, productionId: this.order.existingProductionId, productionNumber: this.order.existingProductionNumber } : null;
  }
}

function svcFor(order: OrderForProduction | null): { svc: ProductionService; repo: FakeRepo; audit: MemAudit } {
  const repo = new FakeRepo(order);
  const audit = new MemAudit();
  return { svc: new ProductionService(repo, new NumberingService(new InMemoryNumberingRepository()), audit), repo, audit };
}

const baseOrder = (over: Partial<OrderForProduction> = {}): OrderForProduction => ({
  id: "ord_1", number: "AB-2026-0001", freigegeben: true, deliveryDate: null, stages: [], existingProductionId: null, existingProductionNumber: null,
  lines: [{ description: "240 Polos", qty: 240, variantId: "v_polo", isBundle: false, components: [] }],
  ...over,
});

describe("ProductionService — Auftrag → Produktionsauftrag (Kap. 5.2)", () => {
  it("erzeugt einen PA mit PA-Nummer + Fertigungsstückliste und setzt IN_PRODUKTION", async () => {
    const { svc, repo, audit } = svcFor(baseOrder());
    const res = await svc.createFromOrder("ord_1");
    expect(res.number).toMatch(/^PA-/);
    expect(res.bomItemCount).toBe(1);
    expect(repo.created[0]?.bomItems[0]).toEqual({ description: "240 Polos", qty: 240, variantId: "v_polo" });
    expect(repo.inProduction).toContain("ord_1");
    expect(audit.entries.at(-1)).toMatchObject({ entity: "ProductionOrder", action: "CREATE" });
  });

  it("expandiert Set-Positionen über die Komponenten-Stückliste × Menge", async () => {
    const { svc, repo } = svcFor(baseOrder({
      lines: [{
        description: "Vereins-Set", qty: 50, variantId: "v_set", isBundle: true,
        components: [
          { description: "Polo rot M", qty: 1, componentVariantId: "v_polo" },
          { description: "Stick Brust links", qty: 1, componentVariantId: null },
        ],
      }],
    }));
    const res = await svc.createFromOrder("ord_1");
    expect(res.bomItemCount).toBe(2);
    expect(repo.created[0]?.bomItems).toEqual([
      { description: "Polo rot M", qty: 50, variantId: "v_polo" },
      { description: "Stick Brust links", qty: 50, variantId: null },
    ]);
  });

  it("setzt die PA-Fälligkeit per Rückwärtsterminierung (Liefertermin − Veredelungsstufen)", async () => {
    const delivery = new Date("2026-07-20T00:00:00.000Z");
    const { svc, repo } = svcFor(baseOrder({ deliveryDate: delivery, stages: [{ label: "Stick", durationDays: 3 }, { label: "Versand", durationDays: 2 }] }));
    const res = await svc.createFromOrder("ord_1");
    // 5 Tage vor dem Liefertermin
    expect(res.dueDate?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(repo.created[0]?.dueDate?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("ohne Stufen ist die PA-Fälligkeit der Liefertermin selbst", async () => {
    const delivery = new Date("2026-07-20T00:00:00.000Z");
    const { svc } = svcFor(baseOrder({ deliveryDate: delivery, stages: [] }));
    const res = await svc.createFromOrder("ord_1");
    expect(res.dueDate?.toISOString()).toBe(delivery.toISOString());
  });

  it("verlangt Freigabe (kein Produktionsstart ohne Freigabe)", async () => {
    const { svc } = svcFor(baseOrder({ freigegeben: false }));
    await expect(svc.createFromOrder("ord_1")).rejects.toBeInstanceOf(ProductionError);
  });

  it("verhindert einen zweiten PA zum selben Auftrag", async () => {
    const { svc } = svcFor(baseOrder());
    await svc.createFromOrder("ord_1");
    await expect(svc.createFromOrder("ord_1")).rejects.toBeInstanceOf(ProductionError);
  });

  it("release gibt den Auftrag frei (idempotent + auditiert)", async () => {
    const { svc, repo, audit } = svcFor(baseOrder({ freigegeben: false }));
    await svc.release("ord_1");
    expect(repo.released).toContain("ord_1");
    expect(audit.entries.at(-1)).toMatchObject({ entity: "Order", after: { freigegeben: true } });
    await svc.release("ord_1"); // idempotent: kein zweiter releaseOrder-Call
    expect(repo.released).toHaveLength(1);
  });
});
