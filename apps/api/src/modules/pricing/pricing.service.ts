// Preisfindung mit Mengenstaffel (B4, Kap. 4.4 / T-15). Bindet die reine
// resolveBasePrice-Pipeline (@texma/shared) an die Preisquellen einer (Firma,
// Variante): kundenindividuelle Staffel → Preisgruppen-Staffel → Einzelpreis.
// Eine Pipeline, klare Präzedenz — kein paralleler Mechanismus.

import {
  resolveBasePrice,
  selectTier,
  type Cents,
  type PriceGroupKind,
  type PriceTier,
  type VariantPrice,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface PriceContext {
  group: PriceGroupKind;
  customerTiers: PriceTier[];
  groupTiers: PriceTier[];
  groupPrices: VariantPrice[];
}

/** Aufgelöster Preis inkl. Herkunft der greifenden Stufe (für die UI/Transparenz). */
export interface ResolvedPrice {
  netCents: Cents;
  source: "KUNDE" | "GRUPPE_STAFFEL" | "GRUPPE_EINZEL";
  minMenge: number | null; // greifende Staffelstufe (null = Einzelpreis ohne Staffel)
}

export interface TierView {
  customerTiers: PriceTier[];
  groupTiers: PriceTier[];
}

export interface PricingRepository {
  /** Lädt alle Preisquellen für (Firma, Variante) inkl. Preisgruppe der Firma. */
  loadPriceContext(companyId: string, variantId: string): Promise<PriceContext>;
  /** Hinterlegte Staffelstufen (kundenindividuell + Preisgruppe) für die Anzeige. */
  listTiers(companyId: string, variantId: string): Promise<TierView>;
  /** Legt/aktualisiert eine Preisgruppen-Staffelstufe der Gruppe der Firma an (B4). */
  upsertGroupTier(companyId: string, variantId: string, minMenge: number, netCents: number): Promise<void>;
}

export class PricingService {
  constructor(
    private readonly repo: PricingRepository,
    private readonly audit: AuditSink
  ) {}

  /** Netto-Basis-VK je Stück für die Bestellmenge (T-15), mit Herkunft der Stufe. */
  async resolve(companyId: string, variantId: string, menge: number): Promise<ResolvedPrice> {
    const ctx = await this.repo.loadPriceContext(companyId, variantId);
    const customer = selectTier(ctx.customerTiers, menge);
    if (customer) return { netCents: customer.netCents, source: "KUNDE", minMenge: customer.minMenge };
    const group = selectTier(ctx.groupTiers, menge);
    if (group) return { netCents: group.netCents, source: "GRUPPE_STAFFEL", minMenge: group.minMenge };
    // Kein Staffeltreffer → Einzelpreis der Gruppe (wirft sichtbar bei Pflegefehler, T-08).
    const netCents = resolveBasePrice(ctx, ctx.group, menge);
    return { netCents, source: "GRUPPE_EINZEL", minMenge: null };
  }

  /** Reiner Netto-Preis je Stück (T-15) — schlanke Variante ohne Herkunft. */
  async netPrice(companyId: string, variantId: string, menge: number): Promise<Cents> {
    const ctx = await this.repo.loadPriceContext(companyId, variantId);
    return resolveBasePrice(ctx, ctx.group, menge);
  }

  /** Staffeltabelle (kundenindividuell + Gruppe) für (Firma, Variante). */
  async listTiers(companyId: string, variantId: string): Promise<TierView> {
    return this.repo.listTiers(companyId, variantId);
  }

  /** Legt eine Preisgruppen-Staffelstufe an (Stammdaten-Pflege, auditiert). */
  async addGroupTier(companyId: string, variantId: string, minMenge: number, netCents: number): Promise<void> {
    if (minMenge < 1) throw new Error("minMenge muss >= 1 sein.");
    if (netCents < 0) throw new Error("netCents darf nicht negativ sein.");
    await this.repo.upsertGroupTier(companyId, variantId, minMenge, netCents);
    await this.audit.append(
      buildEntry({
        entity: "PriceGroupPriceTier",
        entityId: `${variantId}:${String(minMenge)}`,
        action: "CREATE",
        after: { companyId, variantId, minMenge, netCents },
      })
    );
  }
}
