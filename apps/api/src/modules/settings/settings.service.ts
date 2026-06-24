// Admin-Portal: zentrale Einstellungen. Generischer Schlüssel/Wert-Speicher (AppSetting)
// für den Briefkopf, plus die strukturierten Konfig-Tabellen Freigabeschwellen
// (ApprovalThreshold) und Aufschlagsfaktor (MarkupConfig).

import { buildEntry, type AuditSink } from "@texma/audit";

export const BRIEFKOPF_KEY = "briefkopf";
export const SIEBDRUCK_VEREDLER_KEY = "siebdruck_veredler";

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

  /** Briefkopf-Zeilen (für die PDF-Erzeugung); leer = Default des Renderers. */
  async briefkopf(): Promise<string[]> {
    const raw = await this.repo.getSetting(BRIEFKOPF_KEY);
    return raw ? raw.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  }

  /** Standard-Siebdruck-Veredler (Lieferant-ID) — auch operativ lesbar für die Vorbelegung. */
  async siebdruckVeredlerId(): Promise<string | null> {
    const v = await this.repo.getSetting(SIEBDRUCK_VEREDLER_KEY);
    return v && v.trim() ? v.trim() : null;
  }

  async get(): Promise<AppSettings> {
    const [briefkopf, thr, markupFactor, siebdruckVeredlerId] = await Promise.all([
      this.briefkopf(), this.repo.getApprovalThreshold(), this.repo.getMarkupFactor(), this.siebdruckVeredlerId(),
    ]);
    return {
      briefkopf,
      maxDiscountPct: thr.maxDiscountPct,
      maxOrderValueEuro: thr.maxOrderValueCents === null ? null : thr.maxOrderValueCents / 100,
      markupFactor,
      siebdruckVeredlerId,
    };
  }

  async update(patch: Partial<{ briefkopf: string[]; maxDiscountPct: number | null; maxOrderValueEuro: number | null; markupFactor: number; siebdruckVeredlerId: string | null }>): Promise<void> {
    if (patch.briefkopf !== undefined) {
      await this.repo.setSetting(BRIEFKOPF_KEY, patch.briefkopf.join("\n"));
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
    await this.audit.append(buildEntry({ entity: "AppSetting", entityId: "settings", action: "UPDATE", after: patch }));
  }
}
