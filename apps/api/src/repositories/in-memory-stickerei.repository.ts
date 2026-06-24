// In-Memory-Implementierung des Stickerei-Repositories — für Tests/Durchstiche.

import { DEFAULT_MARKUP_CONFIG, type MarkupConfig, type StickereiContext, type StickereiStaffel } from "@texma/shared";
import type {
  CompanyOption,
  LogoFile,
  LogoMarkupContext,
  LogoOption,
  StickereiRepository,
  StoredLogoFile,
  StoredLogoVersion,
} from "../modules/stickerei/stickerei.service.js";

/** Firma inkl. Kundengruppe (für die in-memory Faktor-Auflösung neuer Logos). */
export interface InMemoryCompany extends CompanyOption {
  priceGroupId?: string;
}

export interface InMemoryStickereiSeed {
  markupConfig?: MarkupConfig;
  /** Aufschlags-Override je Logo (logoVersionId → Faktor). */
  logoOverrides?: Record<string, number>;
  /** Kundengruppe je Logo (logoVersionId → priceGroupId). */
  priceGroups?: Record<string, string>;
  /** Auswahlliste für den Logo-Picker. */
  logos?: LogoOption[];
  /** Firmen für die Logo-Zuordnung. */
  companies?: InMemoryCompany[];
}

/** Einheitliches Logo-Label: „Firma · vN (aktiv)". */
function logoLabel(l: LogoOption): string {
  return `${l.companyName ?? l.id} · v${l.version ?? "?"}${l.active ? " (aktiv)" : ""}`;
}

export class InMemoryStickereiRepository implements StickereiRepository {
  private readonly staffeln: Map<string, StickereiStaffel[]>;
  private readonly logoOverrides: Map<string, number>;
  private readonly priceGroups: Map<string, string>;
  private readonly logos: LogoOption[];
  private readonly companies: InMemoryCompany[];
  private readonly files = new Map<string, LogoFile>();
  private markupConfig: MarkupConfig;

  constructor(
    private readonly byCompany: Record<string, StickereiContext> = {},
    seedStaffeln: Record<string, StickereiStaffel[]> = {},
    seed: InMemoryStickereiSeed = {}
  ) {
    this.staffeln = new Map(Object.entries(seedStaffeln).map(([k, v]) => [k, [...v]]));
    this.logoOverrides = new Map(Object.entries(seed.logoOverrides ?? {}));
    this.priceGroups = new Map(Object.entries(seed.priceGroups ?? {}));
    this.logos = seed.logos ? seed.logos.map((l) => ({ ...l })) : [];
    this.companies = seed.companies ? seed.companies.map((c) => ({ ...c })) : [];
    this.markupConfig = seed.markupConfig ?? DEFAULT_MARKUP_CONFIG;
  }

  async contextForCompany(companyId: string): Promise<StickereiContext | null> {
    return this.byCompany[companyId] ?? null;
  }

  async setPartner(companyId: string, supplierId: string | null): Promise<void> {
    const ctx = this.byCompany[companyId] ?? { stickereiPartnerId: null, hatStickdatei: false };
    this.byCompany[companyId] = { ...ctx, stickereiPartnerId: supplierId };
  }

  async listLogos(): Promise<LogoOption[]> {
    return this.logos.map((l) => ({ ...l }));
  }

  async listCompanies(): Promise<CompanyOption[]> {
    return this.companies.map((c) => ({ id: c.id, name: c.name }));
  }

  async createLogoVersion(input: StoredLogoVersion): Promise<LogoOption> {
    const company = this.companies.find((c) => c.id === input.companyId);
    if (!company) throw new Error(`Firma ${input.companyId} nicht gefunden.`);
    const versions = this.logos.filter((l) => l.companyId === input.companyId);
    const version = versions.reduce((m, l) => Math.max(m, l.version ?? 0), 0) + 1;
    const id = `${input.companyId}-v${version}`;
    if (input.active) for (const l of versions) l.active = false;
    const created: LogoOption = {
      id,
      companyId: input.companyId,
      companyName: company.name,
      version,
      active: input.active,
      fileName: input.fileName,
      label: "",
    };
    created.label = logoLabel(created);
    this.logos.push(created);
    this.files.set(id, { fileName: input.fileName, mimeType: input.mimeType, data: input.data });
    if (company.priceGroupId) this.priceGroups.set(id, company.priceGroupId);
    // Labels der Firma neu berechnen (aktiv-Markierung kann sich verschoben haben).
    for (const l of this.logos) if (l.companyId === input.companyId) l.label = logoLabel(l);
    return { ...created };
  }

  async replaceLogoFile(input: StoredLogoFile): Promise<LogoOption> {
    const logo = this.logos.find((l) => l.id === input.logoVersionId);
    if (!logo) throw new Error(`Logo-Version ${input.logoVersionId} nicht gefunden.`);
    logo.fileName = input.fileName;
    this.files.set(input.logoVersionId, { fileName: input.fileName, mimeType: input.mimeType, data: input.data });
    return { ...logo };
  }

  async deleteLogoVersion(logoVersionId: string): Promise<void> {
    const idx = this.logos.findIndex((l) => l.id === logoVersionId);
    if (idx < 0) throw new Error(`Logo-Version ${logoVersionId} nicht gefunden.`);
    const [removed] = this.logos.splice(idx, 1);
    this.files.delete(logoVersionId);
    this.priceGroups.delete(logoVersionId);
    this.logoOverrides.delete(logoVersionId);
    this.staffeln.delete(logoVersionId);
    // War es die aktive Version, rückt die neueste verbleibende der Firma nach.
    if (removed!.active) {
      const rest = this.logos.filter((l) => l.companyId === removed!.companyId);
      const newest = rest.reduce<LogoOption | null>((m, l) => (!m || (l.version ?? 0) > (m.version ?? 0) ? l : m), null);
      if (newest) newest.active = true;
      for (const l of rest) l.label = logoLabel(l);
    }
  }

  async getLogoFile(logoVersionId: string): Promise<LogoFile | null> {
    const f = this.files.get(logoVersionId);
    return f ? { ...f, data: Buffer.from(f.data) } : null;
  }

  async setLogoActive(logoVersionId: string): Promise<void> {
    const target = this.logos.find((l) => l.id === logoVersionId);
    if (!target) throw new Error(`Logo-Version ${logoVersionId} nicht gefunden.`);
    for (const l of this.logos) {
      if (l.companyId === target.companyId) {
        l.active = l.id === logoVersionId;
        l.label = logoLabel(l);
      }
    }
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
