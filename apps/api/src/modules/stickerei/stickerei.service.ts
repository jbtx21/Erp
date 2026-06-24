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
  companyId?: string;
  companyName?: string;
  version?: number;
  active?: boolean;
  /** Dateiname der hochgeladenen Stickdatei (falls vorhanden). */
  fileName?: string;
}

/** Firma für die Logo-Zuordnung (Picker beim Anlegen). */
export interface CompanyOption {
  id: string;
  name: string;
}

/** Hochgeladene Datei (beliebiges Format, Kap. 7.1) — Bytes base64-kodiert übertragen. */
export interface LogoFileUpload {
  name: string;
  mimeType: string;
  dataBase64: string;
}

/** Eingabe zum Anlegen einer neuen Logo-Version (Kap. 7.2) inkl. hochgeladener Stickdatei. */
export interface CreateLogoVersionInput {
  companyId: string;
  file: LogoFileUpload;
  active: boolean;
}

/** Hochgeladene Datei zum Ausliefern (Download/Preview). */
export interface LogoFile {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

/** Maximale Upload-Größe je Stickdatei (Kap. 7.1) — großzügig, Format frei. */
export const MAX_LOGO_FILE_BYTES = 10 * 1024 * 1024;

/** An das Repository übergebene Logo-Version mit bereits dekodierten Datei-Bytes. */
export interface StoredLogoVersion {
  companyId: string;
  active: boolean;
  fileName: string;
  mimeType: string;
  data: Buffer;
}

/** Ersatz-Datei für eine bestehende Logo-Version (Bytes bereits dekodiert). */
export interface StoredLogoFile {
  logoVersionId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface StickereiRepository {
  contextForCompany(companyId: string): Promise<StickereiContext | null>;
  /** Setzt/entfernt den hinterlegten Stickerei-Partner (Lieferant) einer Firma. */
  setPartner(companyId: string, supplierId: string | null): Promise<void>;
  /** Legt eine offene Ausschreibung für ein Logo an. */
  createAusschreibung(logoVersionId: string): Promise<{ id: string }>;
  /** Erfasst ein Angebot (Stick-EK-Staffeln) eines Lieferanten zu einer Ausschreibung. */
  addAngebot(ausschreibungId: string, supplierId: string, staffeln: ReadonlyArray<StickereiStaffel>, notiz: string | null): Promise<{ id: string }>;
  /** Ausschreibungen eines Logos (neueste zuerst, mit Angebotszahl). */
  listAusschreibungen(logoVersionId: string): Promise<AusschreibungSummary[]>;
  /** Eine Ausschreibung mit allen Angeboten (Roh-EK-Staffeln). */
  getAusschreibung(id: string): Promise<AusschreibungRaw | null>;
  /**
   * Entscheidet die Ausschreibung: setzt Gewinner + Status, übernimmt den Lieferanten als
   * Stickerei-Partner der Firma und die Gewinner-Staffeln ans Logo — atomar. Liefert das Logo.
   */
  decideAusschreibung(ausschreibungId: string, gewinnerAngebotId: string): Promise<{ logoVersionId: string }>;
  /** Auswahlliste aller Logos (für den Picker). */
  listLogos(): Promise<LogoOption[]>;
  /** Firmen für die Logo-Zuordnung. */
  listCompanies(): Promise<CompanyOption[]>;
  /** Legt eine neue Logo-Version an (Versionsnummer auto, aktiv setzt andere inaktiv). */
  createLogoVersion(input: StoredLogoVersion): Promise<LogoOption>;
  /** Setzt eine Logo-Version aktiv (genau eine aktiv je Firma, Kap. 7.2). */
  setLogoActive(logoVersionId: string): Promise<void>;
  /** Ersetzt die Datei einer bestehenden Version (Bytes bereits dekodiert). */
  replaceLogoFile(input: StoredLogoFile): Promise<LogoOption>;
  /** Löscht eine Logo-Version (inkl. Staffeln/Datei); rückt ggf. die neueste nach. */
  deleteLogoVersion(logoVersionId: string): Promise<void>;
  /** Liefert die hochgeladene Stickdatei einer Logo-Version (oder null). */
  getLogoFile(logoVersionId: string): Promise<LogoFile | null>;
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

// ── Ausschreibung (RfQ) je Logo: mehrere Angebote (Stick-EK-Staffeln) erfassen,
//    vergleichen, eines wählen → übernimmt Partner + Staffeln ans Logo/Firma. ──────
export type AusschreibungStatus = "OFFEN" | "ENTSCHIEDEN" | "ABGEBROCHEN";

/** Listeneintrag einer Ausschreibung (Übersicht je Logo). */
export interface AusschreibungSummary {
  id: string;
  logoVersionId: string;
  status: AusschreibungStatus;
  gewinnerAngebotId: string | null;
  angebotCount: number;
  createdAt: Date;
}

/** Ein Angebot in der Ausschreibung inkl. berechneter VK je Stufe (zum Vergleich). */
export interface AngebotView {
  id: string;
  supplierId: string;
  supplierName: string | null;
  notiz: string | null;
  staffeln: StickereiStaffelVk[];
}

/** Vollbild einer Ausschreibung: alle Angebote mit berechneten VKs. */
export interface AusschreibungDetail {
  id: string;
  logoVersionId: string;
  status: AusschreibungStatus;
  gewinnerAngebotId: string | null;
  angebote: AngebotView[];
}

/** Roh-Angebot wie es das Repository liefert (EK-Staffeln, VK rechnet der Service). */
export interface AngebotRaw {
  id: string;
  supplierId: string;
  supplierName: string | null;
  notiz: string | null;
  staffeln: StickereiStaffel[];
}

export interface AusschreibungRaw {
  id: string;
  logoVersionId: string;
  status: AusschreibungStatus;
  gewinnerAngebotId: string | null;
  angebote: AngebotRaw[];
}

const FINISHING_STICKEREI = "STICKEREI" as const;

export class StickereiService {
  constructor(private readonly repo: StickereiRepository) {}

  /** Auswahlliste aller Logos für den Picker (Firma · Version). */
  async listLogos(): Promise<LogoOption[]> {
    return this.repo.listLogos();
  }

  /** Firmen für die Logo-Zuordnung beim Anlegen. */
  async listCompanies(): Promise<CompanyOption[]> {
    return this.repo.listCompanies();
  }

  /**
   * Legt eine neue Logo-Version an (Kap. 7.2) inkl. hochgeladener Stickdatei (beliebiges
   * Format, Kap. 7.1): Versionsnummer automatisch, Datei erforderlich, Größenlimit geprüft.
   */
  async createLogoVersion(input: CreateLogoVersionInput): Promise<LogoOption> {
    if (!input.companyId) throw new Error("Firma ist erforderlich.");
    const file = this.decodeUpload(input.file);
    return this.repo.createLogoVersion({ companyId: input.companyId, active: input.active, ...file });
  }

  /** Ersetzt die hochgeladene Stickdatei einer bestehenden Version (Version/Staffeln bleiben). */
  async replaceLogoFile(logoVersionId: string, upload: LogoFileUpload): Promise<LogoOption> {
    if (!logoVersionId) throw new Error("Logo-Version ist erforderlich.");
    const file = this.decodeUpload(upload);
    return this.repo.replaceLogoFile({ logoVersionId, ...file });
  }

  /** Löscht eine Logo-Version (inkl. Staffeln/Datei); war sie aktiv, rückt die neueste nach. */
  async deleteLogoVersion(logoVersionId: string): Promise<void> {
    if (!logoVersionId) throw new Error("Logo-Version ist erforderlich.");
    return this.repo.deleteLogoVersion(logoVersionId);
  }

  /** Dekodiert + validiert einen Upload (Datei vorhanden, nicht leer, Größenlimit). */
  private decodeUpload(file: LogoFileUpload): { fileName: string; mimeType: string; data: Buffer } {
    const name = file?.name?.trim();
    if (!name) throw new Error("Dateiname darf nicht leer sein.");
    if (!file.dataBase64) throw new Error("Es wurde keine Datei hochgeladen.");
    const data = Buffer.from(file.dataBase64, "base64");
    if (data.length === 0) throw new Error("Die hochgeladene Datei ist leer.");
    if (data.length > MAX_LOGO_FILE_BYTES) {
      throw new Error(`Datei zu groß (max. ${Math.round(MAX_LOGO_FILE_BYTES / 1024 / 1024)} MB).`);
    }
    return { fileName: name, mimeType: file.mimeType || "application/octet-stream", data };
  }

  /** Setzt eine Logo-Version aktiv (deaktiviert die übrigen Versionen der Firma). */
  async activateLogoVersion(logoVersionId: string): Promise<void> {
    if (!logoVersionId) throw new Error("Logo-Version ist erforderlich.");
    return this.repo.setLogoActive(logoVersionId);
  }

  /** Hochgeladene Stickdatei einer Logo-Version (für Download/Preview). */
  async getLogoFile(logoVersionId: string): Promise<LogoFile | null> {
    return this.repo.getLogoFile(logoVersionId);
  }

  /** Stickerei-Plan einer Firma (Kap. 5.4): Weg + Digitalisierungsbedarf + Begründung. */
  async routeForCompany(companyId: string): Promise<{ companyId: string; stickereiPartnerId: string | null } & StickereiPlan> {
    const ctx = await this.repo.contextForCompany(companyId);
    if (!ctx) {
      throw new Error(`Firma ${companyId} nicht gefunden.`);
    }
    return { companyId, stickereiPartnerId: ctx.stickereiPartnerId, ...planStickerei(ctx) };
  }

  /**
   * Hinterlegt die (per Mail-Ausschreibung) gewählte Stickerei als Partner der Firma —
   * danach ist bei vorhandener Stickdatei der Weg automatisch DIREKT (Kap. 5.4).
   */
  async setPartner(companyId: string, supplierId: string | null): Promise<void> {
    await this.repo.setPartner(companyId, supplierId);
  }

  /** Eröffnet eine Ausschreibung für ein Logo (Mail-Anfrage extern, Erfassung hier). */
  async createAusschreibung(logoVersionId: string): Promise<{ id: string }> {
    if (!logoVersionId) throw new Error("Logo-Version ist Pflicht.");
    return this.repo.createAusschreibung(logoVersionId);
  }

  /** Erfasst das Angebot eines Lieferanten (Stick-EK je Mengenstaffel) zu einer Ausschreibung. */
  async addAngebot(
    ausschreibungId: string,
    supplierId: string,
    staffeln: ReadonlyArray<StickereiStaffel>,
    notiz: string | null = null
  ): Promise<{ id: string }> {
    if (!supplierId) throw new Error("Lieferant ist Pflicht.");
    if (staffeln.length === 0) throw new Error("Mindestens eine Staffel ist Pflicht.");
    computeStickereiStaffelVks(staffeln); // validiert Staffeln (Dubletten/minMenge<1)
    return this.repo.addAngebot(
      ausschreibungId,
      supplierId,
      staffeln.map((s) => ({ minMenge: s.minMenge, ekCents: s.ekCents })),
      notiz?.trim() || null
    );
  }

  /** Ausschreibungen eines Logos (Übersicht). */
  async listAusschreibungen(logoVersionId: string): Promise<AusschreibungSummary[]> {
    return this.repo.listAusschreibungen(logoVersionId);
  }

  /** Eine Ausschreibung mit allen Angeboten inkl. berechneter VKs (zum Vergleich). */
  async getAusschreibung(id: string): Promise<AusschreibungDetail | null> {
    const a = await this.repo.getAusschreibung(id);
    if (!a) return null;
    const { markup } = await this.markupFor(a.logoVersionId);
    return {
      id: a.id,
      logoVersionId: a.logoVersionId,
      status: a.status,
      gewinnerAngebotId: a.gewinnerAngebotId,
      angebote: a.angebote.map((ang) => ({
        id: ang.id,
        supplierId: ang.supplierId,
        supplierName: ang.supplierName,
        notiz: ang.notiz,
        staffeln: computeStickereiStaffelVks(ang.staffeln, markup),
      })),
    };
  }

  /** Wählt das Gewinner-Angebot: übernimmt Partner + Staffeln (atomar im Repository). */
  async decideAusschreibung(ausschreibungId: string, gewinnerAngebotId: string): Promise<{ logoVersionId: string }> {
    if (!gewinnerAngebotId) throw new Error("Gewinner-Angebot ist Pflicht.");
    return this.repo.decideAusschreibung(ausschreibungId, gewinnerAngebotId);
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
