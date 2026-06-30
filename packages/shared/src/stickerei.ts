// Stickerei-Partnerlogik — Kap. 5.4 (Custom, Kap. 31).
// Neues Logo / kein hinterlegter Partner → Ausschreibung an Stickerei-Partner.
// Wiederholer mit hinterlegtem Partner UND vorhandener Stickdatei → Direktauftrag.

import { type Cents, roundCents } from "./money.js";
import { type MarkupConfig, type MarkupContext, resolveMarkupFactor } from "./markup.js";
import { STICK_MARKUP_FACTOR, deckungsbeitrag, markupVk, selectStaffel } from "./pricing.js";

export type StickereiRoute = "DIREKT" | "AUSSCHREIBUNG";

export interface StickereiContext {
  /** Hinterlegter Stickerei-Partner der Firma (oder null). */
  stickereiPartnerId: string | null;
  /** Liegt eine fertige Stickdatei vor? */
  hatStickdatei: boolean;
}

/**
 * Entscheidet den Weg eines Stick-Auftrags (Kap. 5.4): Direktauftrag nur, wenn
 * Partner UND Stickdatei vorhanden sind — sonst Ausschreibung (Erstauftrag/Logo).
 */
export function decideStickereiRoute(ctx: StickereiContext): StickereiRoute {
  return ctx.stickereiPartnerId && ctx.hatStickdatei ? "DIREKT" : "AUSSCHREIBUNG";
}

export interface StickereiPlan {
  route: StickereiRoute;
  /**
   * Vor der Stickerei muss das Logo digitalisiert (gepuncht) werden — immer dann,
   * wenn keine Stickdatei vorliegt (neues Logo).
   */
  needsDigitizing: boolean;
  reason: string;
}

/**
 * Vollständiger Stickerei-Plan (Kap. 5.4): Weg + ob das Logo erst digitalisiert
 * (gepuncht) werden muss. Wiederholer mit Partner + Datei → Direktauftrag ohne Punch;
 * neues Logo/kein Partner → Ausschreibung, ggf. mit vorgeschaltetem Punch.
 */
export function planStickerei(ctx: StickereiContext): StickereiPlan {
  const route = decideStickereiRoute(ctx);
  const needsDigitizing = !ctx.hatStickdatei;
  let reason: string;
  if (route === "DIREKT") {
    reason = "Hinterlegter Partner und vorhandene Stickdatei → Direktauftrag.";
  } else if (!ctx.stickereiPartnerId) {
    reason = "Kein hinterlegter Partner → Ausschreibung.";
  } else {
    reason = "Partner hinterlegt, aber keine Stickdatei → Ausschreibung mit Digitalisierung.";
  }
  return { route, needsDigitizing, reason };
}

// ── Variable Mengenstaffeln je Logo (Realität, Kap. 4.4 / T-15) ──────────────────
// Die Stickereien kalkulieren intern auf Stichzahl, geben uns aber nur ihren VK (=
// unseren Stick-EK) je Stück gestaffelt nach Bestellmenge (z. B. ab 1/10/25/50/100/250).
// Die Staffelgrenzen sind frei wählbar und können je Logo abweichen. Der Stick-EK wird
// manuell eingetragen; unser VK je Stück = EK × Aufschlag (1,88, Kap. 4.4) — automatisch.

/** Eine frei wählbare Mengenstaffel: ab `minMenge` Stück gilt dieser Stick-EK je Stück. */
export interface StickereiStaffel {
  /** Untere Staffelgrenze in Stück (1, 10, 25, 50, 100, 250 …). */
  minMenge: number;
  /** Stick-EK je Stück in Cent (VK der Stickerei an uns) — manuell erfasst. */
  ekCents: Cents;
}

/** Eine Staffel mit automatisch berechnetem VK je Stück (und DB). */
export interface StickereiStaffelVk extends StickereiStaffel {
  /** Unser VK je Stück = EK × Aufschlag (1,88), kaufmännisch gerundet. */
  vkCents: Cents;
  /** Deckungsbeitrag je Stück = VK − EK. */
  dbCents: Cents;
}

/** Validiert eine Staffelgrenze + EK (ganze, nicht-negative Stückzahl; EK ≥ 0). */
function assertStaffel(s: StickereiStaffel): void {
  if (!Number.isInteger(s.minMenge) || s.minMenge < 1) {
    throw new Error(`Staffel-minMenge muss eine ganze Zahl ≥ 1 sein (ist ${s.minMenge}).`);
  }
  if (s.ekCents < 0) throw new Error("Stick-EK darf nicht negativ sein.");
}

/**
 * Aufschlag für die Staffel-VK-Berechnung: entweder ein fester Faktor (Standardfall)
 * oder eine konfigurierbare Auflösung (globaler Standard + Regeln + Logo-Override).
 * Bei der Auflösung wird je Stufe der Kontext um Menge und EK ergänzt — so greifen
 * Mengen- und EK-Wert-Regeln pro Stufe (Kap. 4.4).
 */
export type StaffelMarkup =
  | number
  | { config: MarkupConfig; context?: MarkupContext; logoOverride?: number | null };

function resolveTierFactor(markup: StaffelMarkup, menge: number, ekCents: Cents): number {
  if (typeof markup === "number") return markup;
  return resolveMarkupFactor(markup.config, { ...markup.context, menge, ekCents }, markup.logoOverride).factor;
}

/** Validiert + sortiert Staffeln aufsteigend (wirft bei Dubletten/ungültigen Grenzen). */
function sortedValidStaffeln(staffeln: ReadonlyArray<StickereiStaffel>): StickereiStaffel[] {
  for (const s of staffeln) assertStaffel(s);
  const sorted = [...staffeln].sort((a, b) => a.minMenge - b.minMenge);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.minMenge === sorted[i - 1]!.minMenge) {
      throw new Error(`Doppelte Staffelgrenze: ${sorted[i]!.minMenge}.`);
    }
  }
  return sorted;
}

function tierVk(s: StickereiStaffel, factor: number): StickereiStaffelVk {
  const vkCents = markupVk(s.ekCents, factor);
  return { ...s, vkCents, dbCents: deckungsbeitrag(vkCents, s.ekCents) };
}

/**
 * Berechnet je frei gewählter Mengenstaffel unseren VK je Stück aus dem manuell
 * eingetragenen Stick-EK (VK = EK × Aufschlag; Standard 1,88 oder konfigurierbar, Kap. 4.4)
 * inkl. DB. Aufsteigend nach minMenge sortiert; doppelte Staffelgrenzen sind nicht erlaubt.
 * Der Faktor wird je Stufe aufgelöst (Kontext: Stufen-Menge + Stufen-EK).
 */
export function computeStickereiStaffelVks(
  staffeln: ReadonlyArray<StickereiStaffel>,
  markup: StaffelMarkup = STICK_MARKUP_FACTOR
): StickereiStaffelVk[] {
  return sortedValidStaffeln(staffeln).map((s) => tierVk(s, resolveTierFactor(markup, s.minMenge, s.ekCents)));
}

/**
 * Wählt die für eine Bestellmenge gültige Staffel: die höchste Staffel, deren
 * `minMenge` ≤ Menge ist (degressiv). Liefert Stick-EK + unseren VK je Stück, oder
 * null, wenn keine Staffel greift (Menge unter der kleinsten Grenze). Der Faktor wird
 * für die konkrete Bestellmenge aufgelöst (nicht für die Stufen-Untergrenze). T-15.
 */
export function stickereiPriceForMenge(
  staffeln: ReadonlyArray<StickereiStaffel>,
  menge: number,
  markup: StaffelMarkup = STICK_MARKUP_FACTOR
): StickereiStaffelVk | null {
  if (menge < 0) throw new Error("Menge darf nicht negativ sein.");
  // sortedValidStaffeln validiert (Dubletten/Grenzen); die Stufenwahl ist die EINE gemeinsame
  // Stufenfunktion (selectStaffel) — identische Semantik wie VK-/EK-Staffel im Preis-Modul.
  const chosen = selectStaffel(sortedValidStaffeln(staffeln), menge);
  return chosen ? tierVk(chosen, resolveTierFactor(markup, menge, chosen.ekCents)) : null;
}

/** Gesamt-EK/-VK/-DB für eine konkrete Bestellmenge über die gültige Staffel (T-15). */
export interface StickereiStaffelTotal {
  staffel: StickereiStaffelVk;
  menge: number;
  ekGesamtCents: Cents;
  vkGesamtCents: Cents;
  dbGesamtCents: Cents;
}

/** Rechnet die gültige Staffel auf eine Bestellmenge hoch (EK/VK/DB gesamt). */
export function stickereiTotalForMenge(
  staffeln: ReadonlyArray<StickereiStaffel>,
  menge: number,
  markup: StaffelMarkup = STICK_MARKUP_FACTOR
): StickereiStaffelTotal | null {
  const staffel = stickereiPriceForMenge(staffeln, menge, markup);
  if (!staffel) return null;
  const ekGesamtCents = roundCents(staffel.ekCents * menge);
  const vkGesamtCents = roundCents(staffel.vkCents * menge);
  return { staffel, menge, ekGesamtCents, vkGesamtCents, dbGesamtCents: vkGesamtCents - ekGesamtCents };
}
