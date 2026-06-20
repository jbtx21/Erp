// Anwendungsfall: Stickerei-Partnerwahl + Mengenstaffeln je Logo (Kap. 5.4 / 4.4).
// Bindet die reine Logik (@texma/shared) an die Stammdaten: hinterlegter Partner +
// vorhandene Stickdatei → Direktauftrag, sonst Ausschreibung. Die Stickereien geben
// uns nur ihren VK (= unseren Stick-EK) je Stück gestaffelt nach Menge; je Logo werden
// die frei wählbaren Staffeln (Stick-EK) persistiert, unser VK = EK × Aufschlag berechnet.
// Der Aufschlagsfaktor ist konfigurierbar: globaler Standard + Regeln (Kundengruppe/Menge/
// Veredelung/EK-Wert) + optionaler Override je Logo (Kap. 4.4). Repository als Interface.

import {
  computeStickereiStaffelVks,
  planStickerei,
  stickereiPriceForMenge,
  validateMarkupConfig,
  type MarkupConfig,
  type StaffelMarkup,
  type StickereiContext,
  type StickereiPlan,
  type StickereiStaffel,
  type StickereiStaffelVk,
} from "@texma/shared";

/** Auflösungs-Infos eines Logos für den Aufschlag (Override + Kundengruppe der Firma). */
export interface LogoMarkupContext {
  logoOverride: number | null;
  priceGroupId?: string;
}

/** Auswahl-Eintrag für den Logo-Picker (Firma + Version, aktiv hervorgehoben). */
export interface LogoOption {
  id: string;
  label: string;
  companyName?: string;
  version?: number;
  active?: boolean;
}

export interface StickereiRepository {
  contextForCompany(companyId: string): Promise<StickereiContext | null>;
  /** Auswahlliste aller Logos (für den Picker). */
  listLogos(): Promise<LogoOption[]>;
  /** Persistierte Staffeln (Stick-EK je Stück) eines Logos, beliebige Reihenfolge. */
  listStaffeln(logoVersionId: string): Promise<StickereiStaffel[]>;
  /** Ersetzt die Staffeln eines Logos vollständig (Set-Semantik). */
  replaceStaffeln(logoVersionId: string, staffeln: ReadonlyArray<StickereiStaffel>): Promise<void>;
  /** Globale Aufschlags-Konfiguration (Standardfaktor + Regeln). */
  getMarkupConfig(): Promise<MarkupConfig>;
  /** Ersetzt die globale Aufschlags-Konfiguration. */
  saveMarkupConfig(config: MarkupConfig): Promise<MarkupConfig>;
  /** Override-Faktor + Kundengruppe eines Logos (für die Faktor-Auflösung). */
  logoMarkupContext(logoVersionId: string): Promise<LogoMarkupContext>;
  /** Setzt/löscht den Aufschlags-Override eines Logos. */
  setLogoOverride(logoVersionId: string, factor: number | null): Promise<void>;
}

export interface StickereiStaffelResult {
  logoVersionId: string;
  staffeln: StickereiStaffelVk[];
  logoOverride: number | null;
  priceGroupId?: string;
}

const FINISHING_STICKEREI = "STICKEREI" as const;

export class StickereiService {
  constructor(private readonly repo: StickereiRepository) {}

  /** Auswahlliste aller Logos für den Picker (Firma · Version). */
  async listLogos(): Promise<LogoOption[]> {
    return this.repo.listLogos();
  }

  /** Stickerei-Plan einer Firma (Kap. 5.4): Weg + Digitalisierungsbedarf + Begründung. */
  async routeForCompany(companyId: string): Promise<{ companyId: string } & StickereiPlan> {
    const ctx = await this.repo.contextForCompany(companyId);
    if (!ctx) {
      throw new Error(`Firma ${companyId} nicht gefunden.`);
    }
    return { companyId, ...planStickerei(ctx) };
  }

  /** Baut die Aufschlags-Auflösung eines Logos: globale Konfig + Kontext + Logo-Override. */
  private async markupFor(logoVersionId: string): Promise<{ markup: StaffelMarkup; ctx: LogoMarkupContext }> {
    const [config, ctx] = await Promise.all([
      this.repo.getMarkupConfig(),
      this.repo.logoMarkupContext(logoVersionId),
    ]);
    const markup: StaffelMarkup = {
      config,
      context: { priceGroupId: ctx.priceGroupId, finishingType: FINISHING_STICKEREI },
      logoOverride: ctx.logoOverride,
    };
    return { markup, ctx };
  }

  /** Staffeln eines Logos mit automatisch berechnetem VK je Stück (konfig. Aufschlag) + DB. */
  async listStaffeln(logoVersionId: string): Promise<StickereiStaffelResult> {
    const [raw, { markup, ctx }] = await Promise.all([
      this.repo.listStaffeln(logoVersionId),
      this.markupFor(logoVersionId),
    ]);
    return {
      logoVersionId,
      staffeln: computeStickereiStaffelVks(raw, markup),
      logoOverride: ctx.logoOverride,
      priceGroupId: ctx.priceGroupId,
    };
  }

  /**
   * Speichert die frei gewählten Staffeln (Stick-EK je Stück) eines Logos und optional den
   * Logo-Override-Faktor. Validiert über die reine Logik und gibt die berechneten VKs zurück.
   */
  async saveStaffeln(
    logoVersionId: string,
    staffeln: ReadonlyArray<StickereiStaffel>,
    logoOverride?: number | null
  ): Promise<StickereiStaffelResult> {
    if (logoOverride != null && !(logoOverride > 0)) {
      throw new Error("Logo-Aufschlagsfaktor muss > 0 sein.");
    }
    computeStickereiStaffelVks(staffeln); // wirft bei ungültiger Staffel-Eingabe
    await this.repo.replaceStaffeln(
      logoVersionId,
      staffeln.map((s) => ({ minMenge: s.minMenge, ekCents: s.ekCents }))
    );
    if (logoOverride !== undefined) await this.repo.setLogoOverride(logoVersionId, logoOverride);
    return this.listStaffeln(logoVersionId);
  }

  /** Gültige Staffel (EK + unser VK je Stück) für eine konkrete Bestellmenge (T-15). */
  async priceForMenge(logoVersionId: string, menge: number): Promise<StickereiStaffelVk | null> {
    const [raw, { markup }] = await Promise.all([
      this.repo.listStaffeln(logoVersionId),
      this.markupFor(logoVersionId),
    ]);
    return stickereiPriceForMenge(raw, menge, markup);
  }

  /** Globale Aufschlags-Konfiguration lesen (Standardfaktor + Regeln, Kap. 4.4). */
  async getMarkupConfig(): Promise<MarkupConfig> {
    return this.repo.getMarkupConfig();
  }

  /** Globale Aufschlags-Konfiguration speichern (validiert: Faktoren > 0, Bereiche konsistent). */
  async saveMarkupConfig(config: MarkupConfig): Promise<MarkupConfig> {
    validateMarkupConfig(config);
    return this.repo.saveMarkupConfig(config);
  }
}
