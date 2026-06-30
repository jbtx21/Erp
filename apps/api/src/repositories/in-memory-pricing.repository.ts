// In-Memory-Preisquellen für Unit-Tests/Dev.

import { bpToFactor, type PriceGroupKind, type PriceTier } from "@texma/shared";
import type {
  CustomerSupplierGroupRow,
  PriceContext,
  PricingRepository,
  SupplierMarkupRow,
  TierView,
} from "../modules/pricing/pricing.service.js";

export class InMemoryPricingRepository implements PricingRepository {
  private readonly contexts = new Map<string, PriceContext>();
  private readonly ek = new Map<string, number>();
  private readonly standardTiers = new Map<string, PriceTier[]>();
  private readonly ekTiersByVariant = new Map<string, { minMenge: number; ekCents: number }[]>();
  // Lieferanten-Aufschlagsmatrix: supplierId → (Kundengruppe → factorBp).
  private readonly markups = new Map<string, Map<PriceGroupKind, number>>();
  // Kundengruppe je Lieferant: companyId → (supplierId → Kundengruppe).
  private readonly custSupGroups = new Map<string, Map<string, PriceGroupKind>>();
  private readonly supplierNames = new Map<string, string>();

  /** Test-Helfer: Lieferantennamen für listCustomerSupplierGroups hinterlegen. */
  setSupplierName(supplierId: string, name: string): void {
    this.supplierNames.set(supplierId, name);
  }

  set(companyId: string, variantId: string, ctx: PriceContext): void {
    this.contexts.set(`${companyId}:${variantId}`, ctx);
  }

  setEk(variantId: string, ekCents: number): void {
    this.ek.set(variantId, ekCents);
  }

  setStandardTiers(variantId: string, tiers: PriceTier[]): void {
    this.standardTiers.set(variantId, tiers);
  }

  setEkTiers(variantId: string, tiers: { minMenge: number; ekCents: number }[]): void {
    this.ekTiersByVariant.set(variantId, tiers);
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

  async listStandardTiers(variantId: string): Promise<PriceTier[]> {
    return this.standardTiers.get(variantId) ?? [];
  }

  async ekTiers(variantId: string): Promise<{ minMenge: number; ekCents: number }[]> {
    return this.ekTiersByVariant.get(variantId) ?? [];
  }

  async listSupplierMarkups(supplierId: string): Promise<SupplierMarkupRow[]> {
    const m = this.markups.get(supplierId);
    if (!m) return [];
    return [...m.entries()].map(([priceGroup, factorBp]) => ({ priceGroup, factorBp, factor: bpToFactor(factorBp) }));
  }

  async setSupplierMarkup(supplierId: string, kind: PriceGroupKind, factorBp: number): Promise<void> {
    let m = this.markups.get(supplierId);
    if (!m) { m = new Map(); this.markups.set(supplierId, m); }
    m.set(kind, factorBp);
  }

  async removeSupplierMarkup(supplierId: string, kind: PriceGroupKind): Promise<void> {
    this.markups.get(supplierId)?.delete(kind);
  }

  async listCustomerSupplierGroups(companyId: string): Promise<CustomerSupplierGroupRow[]> {
    const m = this.custSupGroups.get(companyId);
    if (!m) return [];
    return [...m.entries()].map(([supplierId, priceGroup]) => ({
      supplierId,
      supplierName: this.supplierNames.get(supplierId) ?? supplierId,
      priceGroup,
    }));
  }

  async setCustomerSupplierGroup(companyId: string, supplierId: string, kind: PriceGroupKind): Promise<void> {
    let m = this.custSupGroups.get(companyId);
    if (!m) { m = new Map(); this.custSupGroups.set(companyId, m); }
    m.set(supplierId, kind);
  }

  async removeCustomerSupplierGroup(companyId: string, supplierId: string): Promise<void> {
    this.custSupGroups.get(companyId)?.delete(supplierId);
  }
}
