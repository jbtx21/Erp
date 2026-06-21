// Preisfindung mit Mengenstaffel (B4, Kap. 4.4 / T-15). Bindet die reine
// resolveBasePrice-Pipeline (@texma/shared) an die Preisquellen einer (Firma,
// Variante): kundenindividuelle Staffel → Preisgruppen-Staffel → Einzelpreis.
// Eine Pipeline, klare Präzedenz — kein paralleler Mechanismus.

import {
  resolveBasePrice,
  type Cents,
  type PriceGroupKind,
  type PriceTier,
  type VariantPrice,
} from "@texma/shared";

export interface PriceContext {
  group: PriceGroupKind;
  customerTiers: PriceTier[];
  groupTiers: PriceTier[];
  groupPrices: VariantPrice[];
}

export interface PricingRepository {
  /** Lädt alle Preisquellen für (Firma, Variante) inkl. Preisgruppe der Firma. */
  loadPriceContext(companyId: string, variantId: string): Promise<PriceContext>;
}

export class PricingService {
  constructor(private readonly repo: PricingRepository) {}

  /** Netto-Basis-VK je Stück für die Bestellmenge (T-15). */
  async netPrice(companyId: string, variantId: string, menge: number): Promise<Cents> {
    const ctx = await this.repo.loadPriceContext(companyId, variantId);
    return resolveBasePrice(ctx, ctx.group, menge);
  }
}
