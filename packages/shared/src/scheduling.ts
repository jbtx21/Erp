// Rückwärtsterminierung (B9, Kap. 35.2). Aus dem zugesagten Liefertermin und den
// Durchlaufzeiten der (Veredelungs-)Stufen den spätesten Starttermin ableiten. Rein,
// IO-frei. Stufen laufen sequenziell; die letzte endet am Liefertermin.

import { isBwHoliday } from "./holidays.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Verschiebt ein Datum um `days` Tage (negativ = zurück). */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Kein Werktag: Sa/So oder gesetzlicher Feiertag in Baden-Württemberg. */
function isNonWorkingDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6 || isBwHoliday(d);
}

/** Zieht `workingDays` Werktage (Mo–Fr ohne BW-Feiertage) von `from` ab. */
export function subtractWorkingDays(from: Date, workingDays: number): Date {
  if (workingDays < 0) throw new Error("workingDays must be >= 0");
  let d = new Date(from.getTime());
  let remaining = Math.floor(workingDays);
  while (remaining > 0) {
    d = addDays(d, -1);
    if (!isNonWorkingDay(d)) remaining--;
  }
  return d;
}

/** Addiert `workingDays` Werktage (Mo–Fr ohne BW-Feiertage) auf `from`. */
export function addWorkingDays(from: Date, workingDays: number): Date {
  if (workingDays < 0) throw new Error("workingDays must be >= 0");
  let d = new Date(from.getTime());
  let remaining = Math.floor(workingDays);
  while (remaining > 0) {
    d = addDays(d, 1);
    if (!isNonWorkingDay(d)) remaining--;
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Veredelungs-Durchlaufzeiten (TEXMA-Geschäftsregeln, in Werktagen). Reine Richtwerte
// für den Terminvorschlag — die tatsächliche Dauer ist stückzahlabhängig und erfordert
// IMMER eine manuelle Prüfung/Bestätigung des Produktionstermins.
// ─────────────────────────────────────────────────────────────────────────────

export type FinishingLeadProfile =
  | "INHOUSE_OHNE_TRANSFER"
  | "INHOUSE_MIT_TRANSFER"
  | "EXTERN_STICK_SIEBDRUCK"
  | "EXTERN_UND_INTERN";

export interface FinishingLeadDef {
  label: string;
  /** Durchlaufzeit in Werktagen (Vorschlagsbasis). */
  leadWorkingDays: number;
  /** true = ab Versand zum externen Veredler (Frist gilt für den Versandtag). */
  external: boolean;
}

export const FINISHING_LEAD_PROFILES: Record<FinishingLeadProfile, FinishingLeadDef> = {
  INHOUSE_OHNE_TRANSFER: { label: "Inhouse-Veredelung (ohne Transferdruck-Zukauf)", leadWorkingDays: 5, external: false },
  INHOUSE_MIT_TRANSFER: { label: "Inhouse-Veredelung (mit Transferdruck-Zukauf)", leadWorkingDays: 7, external: false },
  EXTERN_STICK_SIEBDRUCK: { label: "Externe Veredelung — Stick & Siebdruck (ab Versand zum Veredler)", leadWorkingDays: 10, external: true },
  EXTERN_UND_INTERN: { label: "Externe + interne Veredelung (kombiniert)", leadWorkingDays: 12, external: true },
};

/**
 * Terminvorschlag für die Produktion: zugesagter Liefertermin minus der Werktage-
 * Durchlaufzeit. Bei externer Veredelung ist das der späteste Versandtag zum Veredler.
 * Reiner Vorschlag — stückzahlabhängig, immer manuell zu bestätigen.
 */
export function proposeProductionDueDate(deliveryDate: Date, leadWorkingDays: number): Date {
  return subtractWorkingDays(deliveryDate, leadWorkingDays);
}

export interface LeadStage {
  label: string;
  /** Durchlaufzeit der Stufe in Tagen (≥ 0). */
  durationDays: number;
}

export interface ScheduledStage extends LeadStage {
  start: Date;
  end: Date;
}

const nonNegDays = (n: number): number => (n > 0 ? n : 0);

/** Spätester Starttermin = Liefertermin − Summe der Durchlaufzeiten. */
export function backwardStart(
  deliveryDate: Date,
  stages: ReadonlyArray<LeadStage>
): Date {
  const total = stages.reduce((s, st) => s + nonNegDays(st.durationDays), 0);
  return addDays(deliveryDate, -total);
}

/**
 * Stufenplan rückwärts vom Liefertermin: jede Stufe erhält Start/Ende, sequenziell
 * anschließend. Reihenfolge der Eingabe = Produktionsreihenfolge (erste Stufe zuerst).
 */
export function scheduleBackward(
  deliveryDate: Date,
  stages: ReadonlyArray<LeadStage>
): ScheduledStage[] {
  const out: ScheduledStage[] = [];
  let end = deliveryDate;
  for (let i = stages.length - 1; i >= 0; i--) {
    const st = stages[i]!;
    const start = addDays(end, -nonNegDays(st.durationDays));
    out.unshift({ label: st.label, durationDays: st.durationDays, start, end });
    end = start;
  }
  return out;
}
