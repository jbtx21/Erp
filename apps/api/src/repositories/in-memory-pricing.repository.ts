// In-Memory-Preisquellen für Unit-Tests/Dev.

import type { PriceContext, PricingRepository, TierView } from "../modules/pricing/pricing.service.js";

export class InMemoryPricingRepository implements PricingRepository {
  private readonly contexts = new Map<string, PriceContext>();
  private readonly ek = new Map<string, number>();

  set(companyId: string, variantId: string, ctx: PriceContext): void {
    this.contexts.set(`${companyId}:${variantId}`, ctx);
  }

  setEk(variantId: string, ekCents: number): void {
    this.ek.set(variantId, ekCents);
  }

  private ensure(companyId: string, variantId: string): PriceContext {
    const key = `${companyId}:${variantId}`;
    let ctx = this.contexts.get(key);
    if (!ctx) {
      ctx = { group: "STANDARD", customerTiers: [], groupTiers: [], groupPrices: [] };
      this.contexts.set(key, ctx);
    }
    return ctx;
  }

  async loadPriceContext(companyId: string, variantId: string): Promise<PriceContext> {
    return this.ensure(companyId, variantId);
  }

  async listTiers(companyId: string, variantId: string): Promise<TierView> {
    const ctx = this.ensure(companyId, variantId);
    return { customerTiers: ctx.customerTiers, groupTiers: ctx.groupTiers };
  }

  async upsertGroupTier(companyId: string, variantId: string, minMenge: number, netCents: number): Promise<void> {
    const ctx = this.ensure(companyId, variantId);
    const existing = ctx.groupTiers.find((t) => t.minMenge === minMenge);
    if (existing) existing.netCents = netCents;
    else ctx.groupTiers.push({ minMenge, netCents });
  }

  async removeGroupTier(companyId: string, variantId: string, minMenge: number): Promise<void> {
    const ctx = this.ensure(companyId, variantId);
    ctx.groupTiers = ctx.groupTiers.filter((t) => t.minMenge !== minMenge);
  }

  async bestEkCents(variantId: string): Promise<number | null> {
    return this.ek.get(variantId) ?? null;
  }
}
