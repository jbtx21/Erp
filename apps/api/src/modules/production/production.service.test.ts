import { describe, expect, it } from "vitest";
import { ProductionError, ProductionService, type OrderForProduction, type ProductionRepository, type ProductionStatus } from "./production.service.js";
import { NumberingService } from "../numbering/numbering.service.js";
import { InMemoryNumberingRepository } from "../../repositories/in-memory-numbering.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

class FakeRepo implements ProductionRepository {
  created: { number: string; orderId: string; dueDate: Date | null; finishingProfile: string | null; bomItems: { description: string; qty: number; variantId: string | null }[]; subOrders: { number: string; sequence: number; supplierId: string }[] }[] = [];
  inProduction: string[] = [];
  released: string[] = [];
  constructor(private order: OrderForProduction | null) {}
  async loadOrderForProduction(): Promise<OrderForProduction | null> { return this.order; }
  async createProductionOrder(input: { number: string; orderId: string; dueDate: Date | null; finishingProfile: string | null; bomItems: { description: string; qty: number; variantId: string | null }[]; subOrders: { number: string; sequence: number; supplierId: string }[] }): Promise<{ id: string }> {
    this.created.push({ number: input.number, orderId: input.orderId, dueDate: input.dueDate, finishingProfile: input.finishingProfile, bomItems: input.bomItems, subOrders: input.subOrders });
    if (this.order) this.order = { ...this.order, existingProductionId: "pa_1", existingProductionNumber: input.number };
    return { id: "pa_1" };
  }
  async setOrderInProduction(orderId: string): Promise<void> { this.inProduction.push(orderId); }
  async releaseOrder(orderId: string): Promise<void> { this.released.push(orderId); if (this.order) this.order = { ...this.order, freigegeben: true }; }
  facts: { orderValueCents: number; discountPct: number } = { orderValueCents: 0, discountPct: 0 };
  async approvalFacts(): Promise<{ orderValueCents: number; discountPct: number } | null> { return this.order ? this.facts : null; }
  replacedBom: { description: string; qty: number; variantId: string | null }[] | null = null;
  async replaceBomItems(_productionId: string, items: { description: string; qty: number; variantId: string | null }[]): Promise<void> { this.replacedBom = items; }
  async status(): Promise<ProductionStatus | null> {
    return this.order ? { freigegeben: this.order.freigegeben, productionId: this.order.existingProductionId, productionNumber: this.order.existingProductionNumber, finishingProfile: null, dueDate: null } : null;
  }
}

function svcFor(order: OrderForProduction | null): { svc: ProductionService; repo: FakeRepo; audit: MemAudit } {
  const repo = new FakeRepo(order);
  const audit = new MemAudit();
  return { svc: new ProductionService(repo, new NumberingService(new InMemoryNumberingRepository()), audit), repo, audit };
}

const baseOrder = (over: Partial<OrderForProduction> = {}): OrderForProduction => ({
  id: "ord_1", number: "AB-2026-0001", freigegeben: true, deliveryDate: null, procurementLeadDays: null, existingProductionId: null, existingProductionNumber: null,
  lines: [{ description: "240 Polos", qty: 240, variantId: "v_polo", isBundle: false, components: [], veredlerId: null }],
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
        description: "Vereins-Set", qty: 50, variantId: "v_set", isBundle: true, veredlerId: null,
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

  it("schlägt den Produktionstermin per Werktage-Rückwärtsterminierung je Veredelungsweg vor", async () => {
    const delivery = new Date(Date.UTC(2026, 5, 30)); // Di 30.06.2026
    const { svc } = svcFor(baseOrder({ deliveryDate: delivery }));
    const inhouse = await svc.previewSchedule("ord_1", "INHOUSE_OHNE_TRANSFER");
    expect(inhouse.leadWorkingDays).toBe(5);
    expect(inhouse.proposedDueDate).toEqual(new Date(Date.UTC(2026, 5, 23))); // 5 Werktage zurück
    const extern = await svc.previewSchedule("ord_1", "EXTERN_STICK_SIEBDRUCK");
    expect(extern.leadWorkingDays).toBe(10);
    expect(extern.external).toBe(true);
  });

  it("leitet das späteste Bestelldatum aus der Beschaffungs-Lieferzeit ab (Procure-to-Order)", async () => {
    const delivery = new Date(Date.UTC(2026, 5, 30)); // Di 30.06.2026
    const { svc } = svcFor(baseOrder({ deliveryDate: delivery, procurementLeadDays: 8 }));
    const p = await svc.previewSchedule("ord_1", "INHOUSE_OHNE_TRANSFER");
    expect(p.procurementLeadDays).toBe(8);
    // Produktionsstart 23.06. − 8 Werktage → spätestes Bestelldatum beim Lieferanten.
    expect(p.proposedOrderDate).toEqual(new Date(Date.UTC(2026, 5, 11))); // Do 11.06.2026
    // Ohne Beschaffungs-Lieferzeit kein Bestelldatum.
    const none = await (svcFor(baseOrder({ deliveryDate: delivery })).svc).previewSchedule("ord_1", "INHOUSE_OHNE_TRANSFER");
    expect(none.procurementLeadDays).toBeNull();
    expect(none.proposedOrderDate).toBeNull();
  });

  it("übernimmt den manuell bestätigten Produktionstermin + Veredelungsweg", async () => {
    const delivery = new Date(Date.UTC(2026, 6, 20));
    const confirmed = new Date(Date.UTC(2026, 6, 10));
    const { svc, repo } = svcFor(baseOrder({ deliveryDate: delivery }));
    const res = await svc.createFromOrder("ord_1", { dueDate: confirmed, profile: "EXTERN_UND_INTERN" });
    expect(res.dueDate?.toISOString()).toBe(confirmed.toISOString());
    expect(repo.created[0]?.dueDate?.toISOString()).toBe(confirmed.toISOString());
    expect(repo.created[0]?.finishingProfile).toBe("EXTERN_UND_INTERN");
  });

  it("ohne bestätigten Termin gilt der zugesagte Liefertermin", async () => {
    const delivery = new Date(Date.UTC(2026, 6, 20));
    const { svc } = svcFor(baseOrder({ deliveryDate: delivery }));
    const res = await svc.createFromOrder("ord_1");
    expect(res.dueDate?.toISOString()).toBe(delivery.toISOString());
  });

  it("legt bei externem PA je Veredler eine Fremdvergabe-Stufe an (T-04)", async () => {
    const { svc, repo } = svcFor(baseOrder({
      lines: [
        { description: "240 Polos", qty: 240, variantId: "v_polo", isBundle: false, components: [], veredlerId: null },
        { description: "Logo Stick", qty: 240, variantId: "v_logo", isBundle: false, components: [], veredlerId: "sup_stick" },
      ],
    }));
    const res = await svc.createFromOrder("ord_1", { profile: "EXTERN_STICK_SIEBDRUCK" });
    expect(res.subOrderCount).toBe(1);
    const subs = repo.created[0]?.subOrders ?? [];
    expect(subs[0]).toMatchObject({ sequence: 1, supplierId: "sup_stick" });
    expect(subs[0]?.number).toMatch(/-a$/);
  });

  it("legt bei internem PA keine Fremdvergabe an", async () => {
    const { svc, repo } = svcFor(baseOrder({
      lines: [{ description: "Logo Stick", qty: 240, variantId: "v_logo", isBundle: false, components: [], veredlerId: "sup_stick" }],
    }));
    const res = await svc.createFromOrder("ord_1", { profile: "INHOUSE_OHNE_TRANSFER" });
    expect(res.subOrderCount).toBe(0);
    expect(repo.created[0]?.subOrders).toHaveLength(0);
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

  it("Freigabe-Gate (K-10): BÜRO darf über der Rabattgrenze NICHT freigeben", async () => {
    const { svc, repo } = svcFor(baseOrder({ freigegeben: false }));
    repo.facts = { orderValueCents: 50000, discountPct: 20 };
    await expect(
      svc.release("ord_1", { role: "BUERO", thresholds: { maxDiscountPct: 15, maxOrderValueCents: null } })
    ).rejects.toBeInstanceOf(ProductionError);
    expect(repo.released).toHaveLength(0);
  });

  it("Freigabe-Gate: ADMIN darf über der Grenze freigeben", async () => {
    const { svc, repo } = svcFor(baseOrder({ freigegeben: false }));
    repo.facts = { orderValueCents: 50000, discountPct: 20 };
    await svc.release("ord_1", { role: "ADMIN", thresholds: { maxDiscountPct: 15, maxOrderValueCents: null } });
    expect(repo.released).toContain("ord_1");
  });

  it("Freigabe-Gate: BÜRO darf innerhalb der Grenzen freigeben", async () => {
    const { svc, repo } = svcFor(baseOrder({ freigegeben: false }));
    repo.facts = { orderValueCents: 50000, discountPct: 10 };
    await svc.release("ord_1", { role: "BUERO", thresholds: { maxDiscountPct: 15, maxOrderValueCents: 100000 } });
    expect(repo.released).toContain("ord_1");
  });

  it("rebuildBomForOrder: baut die Stückliste neu, wenn ein PA existiert", async () => {
    const { svc, repo } = svcFor(baseOrder({ existingProductionId: "pa_1", lines: [
      { description: "240 Polos", qty: 240, variantId: "v_polo", isBundle: false, components: [], veredlerId: null },
    ] }));
    const res = await svc.rebuildBomForOrder("ord_1");
    expect(res).toEqual({ rebuilt: true, bomItemCount: 1 });
    expect(repo.replacedBom).toHaveLength(1);
  });

  it("rebuildBomForOrder: No-op ohne PA", async () => {
    const { svc, repo } = svcFor(baseOrder({ existingProductionId: null }));
    const res = await svc.rebuildBomForOrder("ord_1");
    expect(res.rebuilt).toBe(false);
    expect(repo.replacedBom).toBeNull();
  });

  it("Freigabe-Gate: greift über dem Auftragswert", async () => {
    const { svc, repo } = svcFor(baseOrder({ freigegeben: false }));
    repo.facts = { orderValueCents: 200000, discountPct: 0 };
    await expect(
      svc.release("ord_1", { role: "BUERO", thresholds: { maxDiscountPct: null, maxOrderValueCents: 100000 } })
    ).rejects.toBeInstanceOf(ProductionError);
  });
});
