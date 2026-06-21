// In-Memory-Preisquellen für Unit-Tests/Dev.

import type { PriceContext, PricingRepository } from "../modules/pricing/pricing.service.js";

export class InMemoryPricingRepository implements PricingRepository {
  private readonly contexts = new Map<string, PriceContext>();

  set(companyId: string, variantId: string, ctx: PriceContext): void {
    this.contexts.set(`${companyId}:${variantId}`, ctx);
  }

  async loadPriceContext(companyId: string, variantId: string): Promise<PriceContext> {
    const ctx = this.contexts.get(`${companyId}:${variantId}`);
    if (!ctx) {
      return { group: "STANDARD", customerTiers: [], groupTiers: [], groupPrices: [] };
    }
    return ctx;
  }
}
