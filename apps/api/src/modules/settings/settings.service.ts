// Admin-Portal: zentrale Einstellungen. Generischer Schlüssel/Wert-Speicher (AppSetting)
// für den Briefkopf, plus die strukturierten Konfig-Tabellen Freigabeschwellen
// (ApprovalThreshold) und Aufschlagsfaktor (MarkupConfig).

import { buildEntry, type AuditSink } from "@texma/audit";
import { FIRMA_DEFAULT, type FirmenProfil } from "@texma/shared";

export const BRIEFKOPF_KEY = "briefkopf";
/** Strukturiertes Firmenprofil (JSON) für Belegkopf/-fuß (Name/Anschrift/USt-IdNr/GF/Bank). */
export const COMPANY_PROFILE_KEY = "company_profile";
/** Firmenlogo (JPEG base64, ohne data:-Präfix) für den Belegkopf. */
export const COMPANY_LOGO_KEY = "company_logo_b64";
export const SIEBDRUCK_VEREDLER_KEY = "siebdruck_veredler";
export const DEFAULT_TAX_RATE_KEY = "default_tax_rate_pct";
/** Globaler USt-Satz, wenn nichts konfiguriert ist (Regelsteuersatz). */
export const DEFAULT_TAX_RATE_PCT = 19;

export interface AppSettings {
  /** Briefkopf-Zeilen (Absender auf Lieferschein/Rechnung). */
  briefkopf: string[];
  /** Freigabeschwellen (K-10): max. Rabatt-% und Auftragswert (Euro). null = nicht gesetzt. */
  maxDiscountPct: number | null;
  maxOrderValueEuro: number | null;
  /** Aufschlagsfaktor (Kap. 4.4). */
  markupFactor: number;
  /** Standard-Veredler für Siebdruck (Lieferant-ID) — Vorbelegung bei Logo/Siebdruck. */
  siebdruckVeredlerId: string | null;
  /** Globaler USt-Satz in Prozent — gilt für alle Positionen (zentral, keine USt je Position). */
  defaultTaxRatePct: number;
  /** Firmenprofil für Belegkopf/-fuß (Name/Anschrift/USt-IdNr/GF/Bank). */
  companyProfile: FirmenProfil;
  /** Firmenlogo (JPEG base64) für den Belegkopf; null = gebündelter TEXMA-Default. */
  companyLogoB64: string | null;
}

export interface SettingsRepository {
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  getApprovalThreshold(): Promise<{ maxDiscountPct: number | null; maxOrderValueCents: number | null }>;
  setApprovalThreshold(input: { maxDiscountPct: number | null; maxOrderValueCents: number | null }): Promise<void>;
  getMarkupFactor(): Promise<number>;
  setMarkupFactor(factor: number): Promise<void>;
}

export class SettingsError extends Error {}

export class SettingsService {
  constructor(private readonly repo: SettingsRepository, private readonly audit: AuditSink) {}

  /** Briefkopf-Zeilen (für die PDF-Erzeugung); ohne expliziten Briefkopf aus dem Firmenprofil. */
  async briefkopf(): Promise<string[]> {
    const raw = await this.repo.getSetting(BRIEFKOPF_KEY);
    if (raw) return raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const f = await this.companyProfile();
    return [f.name, `${f.street} · ${f.zipCity}`, `${f.tel} · ${f.mail}`];
  }

  /** Standard-Siebdruck-Veredler (Lieferant-ID) — auch operativ lesbar für die Vorbelegung. */
  async siebdruckVeredlerId(): Promise<string | null> {
    const v = await this.repo.getSetting(SIEBDRUCK_VEREDLER_KEY);
    return v && v.trim() ? v.trim() : null;
  }

  /** Firmenprofil für Belegkopf/-fuß; fehlende Felder werden mit dem Default ergänzt. */
  async companyProfile(): Promise<FirmenProfil> {
    const raw = await this.repo.getSetting(COMPANY_PROFILE_KEY);
    if (!raw) return { ...FIRMA_DEFAULT };
    try { return { ...FIRMA_DEFAULT, ...(JSON.parse(raw) as Partial<FirmenProfil>) }; }
    catch { return { ...FIRMA_DEFAULT }; }
  }

  /** Firmenlogo (JPEG base64) für den Belegkopf; null = gebündelter Default. */
  async companyLogoB64(): Promise<string | null> {
    const raw = await this.repo.getSetting(COMPANY_LOGO_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  }

  /** Globaler USt-Satz (auch operativ lesbar — Vorbelegung der Positionssummen). */
  async defaultTaxRatePct(): Promise<number> {
    const v = await this.repo.getSetting(DEFAULT_TAX_RATE_KEY);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_TAX_RATE_PCT;
  }

  async get(): Promise<AppSettings> {
    const [briefkopf, thr, markupFactor, siebdruckVeredlerId, defaultTaxRatePct, companyProfile, companyLogoB64] = await Promise.all([
      this.briefkopf(), this.repo.getApprovalThreshold(), this.repo.getMarkupFactor(), this.siebdruckVeredlerId(), this.defaultTaxRatePct(), this.companyProfile(), this.companyLogoB64(),
    ]);
    return {
      briefkopf,
      maxDiscountPct: thr.maxDiscountPct,
      maxOrderValueEuro: thr.maxOrderValueCents === null ? null : thr.maxOrderValueCents / 100,
      markupFactor,
      siebdruckVeredlerId,
      defaultTaxRatePct,
      companyProfile,
      companyLogoB64,
    };
  }

  async update(patch: Partial<{ briefkopf: string[]; maxDiscountPct: number | null; maxOrderValueEuro: number | null; markupFactor: number; siebdruckVeredlerId: string | null; defaultTaxRatePct: number; companyProfile: Partial<FirmenProfil>; companyLogoB64: string | null }>): Promise<void> {
    if (patch.briefkopf !== undefined) {
      await this.repo.setSetting(BRIEFKOPF_KEY, patch.briefkopf.join("\n"));
    }
    if (patch.companyLogoB64 !== undefined) {
      // base64 ohne data:-Präfix speichern (leer = Default-Logo).
      const clean = (patch.companyLogoB64 ?? "").replace(/^data:image\/[a-z]+;base64,/i, "").trim();
      await this.repo.setSetting(COMPANY_LOGO_KEY, clean);
    }
    if (patch.companyProfile !== undefined) {
      // Bestehende Werte erhalten, nur übergebene Felder überschreiben (Teil-Update).
      const merged: FirmenProfil = { ...(await this.companyProfile()), ...patch.companyProfile };
      await this.repo.setSetting(COMPANY_PROFILE_KEY, JSON.stringify(merged));
    }
    if (patch.siebdruckVeredlerId !== undefined) {
      await this.repo.setSetting(SIEBDRUCK_VEREDLER_KEY, patch.siebdruckVeredlerId?.trim() ?? "");
    }
    if (patch.maxDiscountPct !== undefined || patch.maxOrderValueEuro !== undefined) {
      const cur = await this.repo.getApprovalThreshold();
      await this.repo.setApprovalThreshold({
        maxDiscountPct: patch.maxDiscountPct !== undefined ? patch.maxDiscountPct : cur.maxDiscountPct,
        maxOrderValueCents: patch.maxOrderValueEuro !== undefined ? (patch.maxOrderValueEuro === null ? null : Math.round(patch.maxOrderValueEuro * 100)) : cur.maxOrderValueCents,
      });
    }
    if (patch.markupFactor !== undefined) {
      if (patch.markupFactor <= 0) throw new SettingsError("Aufschlagsfaktor muss > 0 sein.");
      await this.repo.setMarkupFactor(patch.markupFactor);
    }
    if (patch.defaultTaxRatePct !== undefined) {
      if (!Number.isInteger(patch.defaultTaxRatePct) || patch.defaultTaxRatePct < 0 || patch.defaultTaxRatePct > 100) {
        throw new SettingsError("USt-Satz muss zwischen 0 und 100 liegen.");
      }
      await this.repo.setSetting(DEFAULT_TAX_RATE_KEY, String(patch.defaultTaxRatePct));
    }
    await this.audit.append(buildEntry({ entity: "AppSetting", entityId: "settings", action: "UPDATE", after: patch }));
  }
}
