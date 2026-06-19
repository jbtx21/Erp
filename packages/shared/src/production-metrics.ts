// Produktions-Kennzahlen / operatives Reporting — Kap. 29/35. Reine, IO-freie Logik
// für Durchlaufzeit (Lead Time) und Fehlerquote (Reklamationsquote) sowie deren
// Bucketing nach Tag/Woche/Monat/Jahr. Bewusst OHNE Geld-/Kundenfelder — diese
// Auswertungen sind operativ und damit auch für die Rolle PRODUKTION zugänglich
// (RBAC, Kap. 12). Datums-Bucketing wird aus reporting.ts wiederverwendet.

import { bucketKey, bucketStart, type Granularity } from "./reporting.js";

const HOUR_MS = 3_600_000;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Durchlaufzeit (Lead Time): Zeit von Auftragsanlage bis Fertigstellung/Versand.
// ─────────────────────────────────────────────────────────────────────────────

export interface LeadTimePoint {
  /** Bezugszeitpunkt für das Bucketing (Fertigstellung/Versand). */
  at: Date;
  /** Durchlaufzeit in Stunden (>= 0). */
  hours: number;
}

export interface LeadTimeStats {
  count: number;
  avgHours: number;
  medianHours: number;
  minHours: number;
  maxHours: number;
}

export interface LeadTimeBucket {
  key: string;
  start: Date;
  count: number;
  avgHours: number;
}

/** Durchlaufzeit in Stunden zwischen Start (Anlage) und Ende (Fertigstellung). */
export function leadTimeHours(start: Date, end: Date): number {
  const h = (end.getTime() - start.getTime()) / HOUR_MS;
  return round1(Math.max(0, h));
}

/** Kennzahlen über alle Durchlaufzeiten (Mittel/Median/Min/Max). Leer → Nullen. */
export function computeLeadTimeStats(points: ReadonlyArray<LeadTimePoint>): LeadTimeStats {
  if (points.length === 0) {
    return { count: 0, avgHours: 0, medianHours: 0, minHours: 0, maxHours: 0 };
  }
  const hours = points.map((p) => p.hours).sort((a, b) => a - b);
  const sum = hours.reduce((s, h) => s + h, 0);
  const mid = Math.floor(hours.length / 2);
  const median =
    hours.length % 2 === 0 ? (hours[mid - 1]! + hours[mid]!) / 2 : hours[mid]!;
  return {
    count: hours.length,
    avgHours: round1(sum / hours.length),
    medianHours: round1(median),
    minHours: hours[0]!,
    maxHours: hours[hours.length - 1]!,
  };
}

/** Durchschnittliche Durchlaufzeit je Periode (aufsteigend sortiert). */
export function bucketLeadTime(
  points: ReadonlyArray<LeadTimePoint>,
  g: Granularity
): LeadTimeBucket[] {
  const byKey = new Map<string, { start: Date; count: number; sum: number }>();
  for (const p of points) {
    const key = bucketKey(p.at, g);
    const e = byKey.get(key);
    if (e) {
      e.count += 1;
      e.sum += p.hours;
    } else {
      byKey.set(key, { start: bucketStart(p.at, g), count: 1, sum: p.hours });
    }
  }
  return [...byKey.entries()]
    .map(([key, e]) => ({ key, start: e.start, count: e.count, avgHours: round1(e.sum / e.count) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// Fehlerquote (Reklamationsquote): Anteil reklamierter Aufträge.
// ─────────────────────────────────────────────────────────────────────────────

/** Reklamationsursache (entspricht ComplaintCause im Schema). */
export type DefectCause = "LIEFERANT" | "INTERN" | "EXTERN_VEREDLER";

export interface DefectPoint {
  /** Auftragsdatum (Bezug für das Bucketing). */
  at: Date;
  /** true, wenn zum Auftrag mindestens eine Reklamation vorliegt. */
  defective: boolean;
  /** Ursache der (Haupt-)Reklamation, falls vorhanden. */
  cause?: DefectCause;
}

export interface DefectRate {
  total: number;
  defects: number;
  /** Fehlerquote in Prozent (kaufmännisch gerundet); null, wenn total 0. */
  ratePercent: number | null;
}

export interface DefectBucket {
  key: string;
  start: Date;
  total: number;
  defects: number;
  ratePercent: number | null;
}

/** Fehlerquote aus Gesamtzahl und Fehleranzahl. */
export function computeDefectRate(total: number, defects: number): DefectRate {
  return { total, defects, ratePercent: total === 0 ? null : Math.round((defects / total) * 100) };
}

/** Gesamt-Fehlerquote über alle Auftragspunkte. */
export function defectRate(points: ReadonlyArray<DefectPoint>): DefectRate {
  return computeDefectRate(points.length, points.filter((p) => p.defective).length);
}

/** Reklamationen je Ursache (für die Ursachenanalyse, Kap. 20). */
export function defectsByCause(points: ReadonlyArray<DefectPoint>): Record<DefectCause, number> {
  const out: Record<DefectCause, number> = { LIEFERANT: 0, INTERN: 0, EXTERN_VEREDLER: 0 };
  for (const p of points) {
    if (p.defective && p.cause) out[p.cause] += 1;
  }
  return out;
}

/** Fehlerquote je Periode (aufsteigend sortiert). */
export function bucketDefectRate(
  points: ReadonlyArray<DefectPoint>,
  g: Granularity
): DefectBucket[] {
  const byKey = new Map<string, { start: Date; total: number; defects: number }>();
  for (const p of points) {
    const key = bucketKey(p.at, g);
    const e = byKey.get(key);
    if (e) {
      e.total += 1;
      if (p.defective) e.defects += 1;
    } else {
      byKey.set(key, { start: bucketStart(p.at, g), total: 1, defects: p.defective ? 1 : 0 });
    }
  }
  return [...byKey.entries()]
    .map(([key, e]) => ({
      key,
      start: e.start,
      total: e.total,
      defects: e.defects,
      ratePercent: computeDefectRate(e.total, e.defects).ratePercent,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// Termintreue (On-Time-Quote): Anteil termingerecht fertiggestellter Aufträge.
// ─────────────────────────────────────────────────────────────────────────────

export interface OnTimePoint {
  /** Fertigstellung (Bezug für das Bucketing). */
  at: Date;
  /** true, wenn die Fertigstellung am/vor dem Zieltermin lag. */
  onTime: boolean;
}

export interface OnTimeRate {
  total: number;
  onTime: number;
  /** Termintreue in Prozent (kaufmännisch gerundet); null, wenn total 0. */
  ratePercent: number | null;
}

export interface OnTimeBucket {
  key: string;
  start: Date;
  total: number;
  onTime: number;
  ratePercent: number | null;
}

/** Ob die Fertigstellung den Zieltermin einhält (am Termin gilt als pünktlich). */
export function isOnTime(completedAt: Date, dueDate: Date): boolean {
  return completedAt.getTime() <= dueDate.getTime();
}

/** Termintreue aus Gesamtzahl und Anzahl pünktlicher Aufträge. */
export function computeOnTimeRate(total: number, onTime: number): OnTimeRate {
  return { total, onTime, ratePercent: total === 0 ? null : Math.round((onTime / total) * 100) };
}

/** Gesamt-Termintreue über alle Auftragspunkte (mit Zieltermin). */
export function onTimeRate(points: ReadonlyArray<OnTimePoint>): OnTimeRate {
  return computeOnTimeRate(points.length, points.filter((p) => p.onTime).length);
}

/** Termintreue je Periode (aufsteigend sortiert). */
export function bucketOnTimeRate(
  points: ReadonlyArray<OnTimePoint>,
  g: Granularity
): OnTimeBucket[] {
  const byKey = new Map<string, { start: Date; total: number; onTime: number }>();
  for (const p of points) {
    const key = bucketKey(p.at, g);
    const e = byKey.get(key);
    if (e) {
      e.total += 1;
      if (p.onTime) e.onTime += 1;
    } else {
      byKey.set(key, { start: bucketStart(p.at, g), total: 1, onTime: p.onTime ? 1 : 0 });
    }
  }
  return [...byKey.entries()]
    .map(([key, e]) => ({
      key,
      start: e.start,
      total: e.total,
      onTime: e.onTime,
      ratePercent: computeOnTimeRate(e.total, e.onTime).ratePercent,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
