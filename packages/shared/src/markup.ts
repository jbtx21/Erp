// Konfigurierbare Aufschlagsfaktoren (Kap. 4.4): EIN globaler Standardfaktor, der durch
// Regeln je Parameter überschrieben wird — Kundengruppe (Preisgruppe), Mengenstaffel,
// Veredelungsart und EK-Wertbereich — plus optionaler Override je Logo (gewinnt immer).
// Reine Auflösung; Persistenz/Repositories liegen in der API. „Jederzeit neu definierbar":
// Default + Regeln sind Daten (kein Code-Konstante mehr).
import { STICK_MARKUP_FACTOR } from "./pricing.js";

/** Veredelungsarten (Kap. 5): aktuell modelliert die Stickerei; ausbaubar. */
export type FinishingType = "STICKEREI" | "DRUCK" | "TRANSFER";

/**
 * Eine Aufschlags-Regel: Faktor unter optionalen, UND-verknüpften Bedingungen.
 * Alle Bedingungen leer ⇒ greift immer (wirkt wie ein zusätzlicher Default).
 */
export interface MarkupRule {
  id?: string;
  /** Aufschlagsfaktor VK = EK × factor (z. B. 1.88). */
  factor: number;
  label?: string;
  // ── Bedingungen (alle optional) ──
  priceGroupId?: string; // Kundengruppe
  finishingType?: FinishingType; // Veredelungsart
  minMenge?: number; // ab Menge (inkl.)
  maxMenge?: number; // bis Menge (inkl.)
  minEkCents?: number; // EK-Wertbereich ab (inkl.)
  maxEkCents?: number; // EK-Wertbereich bis (inkl.)
}

/** Globale Aufschlags-Konfiguration: Standardfaktor + überschreibende Regeln. */
export interface MarkupConfig {
  defaultFactor: number;
  rules: MarkupRule[];
}

/** Auflösungskontext: bekannte Parameter des konkreten Falls. */
export interface MarkupContext {
  priceGroupId?: string;
  finishingType?: FinishingType;
  menge?: number;
  ekCents?: number;
}

export interface ResolvedMarkup {
  factor: number;
  source: "logo-override" | "rule" | "default";
  ruleId?: string;
  ruleLabel?: string;
}

/** Vorbelegung: globaler Standard 1,88 (Kap. 4.4), keine Regeln. */
export const DEFAULT_MARKUP_CONFIG: MarkupConfig = { defaultFactor: STICK_MARKUP_FACTOR, rules: [] };

/** Anzahl gesetzter Bedingungen einer Regel = Spezifität (spezifischere Regel gewinnt). */
function specificity(rule: MarkupRule): number {
  return (
    (rule.priceGroupId !== undefined ? 1 : 0) +
    (rule.finishingType !== undefined ? 1 : 0) +
    (rule.minMenge !== undefined ? 1 : 0) +
    (rule.maxMenge !== undefined ? 1 : 0) +
    (rule.minEkCents !== undefined ? 1 : 0) +
    (rule.maxEkCents !== undefined ? 1 : 0)
  );
}

/** Greift die Regel im Kontext? Eine gesetzte Bedingung muss erfüllbar UND erfüllt sein. */
function ruleMatches(rule: MarkupRule, ctx: MarkupContext): boolean {
  if (rule.priceGroupId !== undefined && rule.priceGroupId !== ctx.priceGroupId) return false;
  if (rule.finishingType !== undefined && rule.finishingType !== ctx.finishingType) return false;
  if (rule.minMenge !== undefined && !(ctx.menge !== undefined && ctx.menge >= rule.minMenge)) return false;
  if (rule.maxMenge !== undefined && !(ctx.menge !== undefined && ctx.menge <= rule.maxMenge)) return false;
  if (rule.minEkCents !== undefined && !(ctx.ekCents !== undefined && ctx.ekCents >= rule.minEkCents)) return false;
  if (rule.maxEkCents !== undefined && !(ctx.ekCents !== undefined && ctx.ekCents <= rule.maxEkCents)) return false;
  return true;
}

/**
 * Löst den gültigen Aufschlagsfaktor auf: Logo-Override (falls gesetzt) gewinnt; sonst
 * die spezifischste passende Regel (bei Gleichstand die zuerst gelistete); sonst der
 * globale Standardfaktor. Liefert zusätzlich die Quelle (für Transparenz in der UI).
 */
export function resolveMarkupFactor(
  config: MarkupConfig,
  ctx: MarkupContext,
  logoOverride?: number | null
): ResolvedMarkup {
  if (logoOverride != null) {
    if (!(logoOverride > 0)) throw new Error("Logo-Aufschlagsfaktor muss > 0 sein.");
    return { factor: logoOverride, source: "logo-override" };
  }
  let best: MarkupRule | null = null;
  let bestSpec = -1;
  for (const r of config.rules) {
    if (!ruleMatches(r, ctx)) continue;
    const s = specificity(r);
    if (s > bestSpec) {
      best = r;
      bestSpec = s;
    }
  }
  if (best) return { factor: best.factor, source: "rule", ruleId: best.id, ruleLabel: best.label };
  return { factor: config.defaultFactor, source: "default" };
}

/** Validiert eine Aufschlags-Konfiguration (Faktoren > 0, Bereichsgrenzen konsistent). */
export function validateMarkupConfig(config: MarkupConfig): void {
  if (!(config.defaultFactor > 0)) throw new Error("Standard-Aufschlagsfaktor muss > 0 sein.");
  for (const r of config.rules) {
    if (!(r.factor > 0)) throw new Error("Regel-Aufschlagsfaktor muss > 0 sein.");
    if (r.minMenge !== undefined && (!Number.isInteger(r.minMenge) || r.minMenge < 1)) {
      throw new Error("Regel: minMenge muss eine ganze Zahl ≥ 1 sein.");
    }
    if (r.minMenge !== undefined && r.maxMenge !== undefined && r.minMenge > r.maxMenge) {
      throw new Error("Regel: minMenge darf nicht größer als maxMenge sein.");
    }
    if (r.minEkCents !== undefined && r.maxEkCents !== undefined && r.minEkCents > r.maxEkCents) {
      throw new Error("Regel: minEkCents darf nicht größer als maxEkCents sein.");
    }
  }
}
