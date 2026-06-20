// In-Memory-Implementierung des Stickerei-Repositories — für Tests/Durchstiche.

import { DEFAULT_MARKUP_CONFIG, type MarkupConfig, type StickereiContext, type StickereiStaffel } from "@texma/shared";
import type { LogoMarkupContext, LogoOption, StickereiRepository } from "../modules/stickerei/stickerei.service.js";

export interface InMemoryStickereiSeed {
  markupConfig?: MarkupConfig;
  /** Aufschlags-Override je Logo (logoVersionId → Faktor). */
  logoOverrides?: Record<string, number>;
  /** Kundengruppe je Logo (logoVersionId → priceGroupId). */
  priceGroups?: Record<string, string>;
  /** Auswahlliste für den Logo-Picker. */
  logos?: LogoOption[];
}

export class InMemoryStickereiRepository implements StickereiRepository {
  private readonly staffeln: Map<string, StickereiStaffel[]>;
  private readonly logoOverrides: Map<string, number>;
  private readonly priceGroups: Map<string, string>;
  private readonly logos: LogoOption[];
  private markupConfig: MarkupConfig;

  constructor(
    private readonly byCompany: Record<string, StickereiContext> = {},
    seedStaffeln: Record<string, StickereiStaffel[]> = {},
    seed: InMemoryStickereiSeed = {}
  ) {
    this.staffeln = new Map(Object.entries(seedStaffeln).map(([k, v]) => [k, [...v]]));
    this.logoOverrides = new Map(Object.entries(seed.logoOverrides ?? {}));
    this.priceGroups = new Map(Object.entries(seed.priceGroups ?? {}));
    this.logos = seed.logos ? [...seed.logos] : [];
    this.markupConfig = seed.markupConfig ?? DEFAULT_MARKUP_CONFIG;
  }

  async contextForCompany(companyId: string): Promise<StickereiContext | null> {
    return this.byCompany[companyId] ?? null;
  }

  async listLogos(): Promise<LogoOption[]> {
    return this.logos.map((l) => ({ ...l }));
  }

  async listStaffeln(logoVersionId: string): Promise<StickereiStaffel[]> {
    return [...(this.staffeln.get(logoVersionId) ?? [])];
  }

  async replaceStaffeln(
    logoVersionId: string,
    staffeln: ReadonlyArray<StickereiStaffel>
  ): Promise<void> {
    this.staffeln.set(
      logoVersionId,
      staffeln.map((s) => ({ minMenge: s.minMenge, ekCents: s.ekCents }))
    );
  }

  async getMarkupConfig(): Promise<MarkupConfig> {
    return { defaultFactor: this.markupConfig.defaultFactor, rules: this.markupConfig.rules.map((r) => ({ ...r })) };
  }

  async saveMarkupConfig(config: MarkupConfig): Promise<MarkupConfig> {
    this.markupConfig = { defaultFactor: config.defaultFactor, rules: config.rules.map((r) => ({ ...r })) };
    return this.getMarkupConfig();
  }

  async logoMarkupContext(logoVersionId: string): Promise<LogoMarkupContext> {
    return {
      logoOverride: this.logoOverrides.get(logoVersionId) ?? null,
      priceGroupId: this.priceGroups.get(logoVersionId),
    };
  }

  async setLogoOverride(logoVersionId: string, factor: number | null): Promise<void> {
    if (factor == null) this.logoOverrides.delete(logoVersionId);
    else this.logoOverrides.set(logoVersionId, factor);
  }
}
