// Reporting / Auswertungen — Kap. 29. Reine, IO-freie Aggregationslogik für die
// Umsatz- und Auftragsübersicht sowie den Periodenvergleich (Tag/Woche/Monat/Jahr).
// Beträge in Cent (Integer); Datums-Bucketing in UTC, damit Tests deterministisch sind.
// Die KI-Erzählung (claude-api) und die Persistenz liegen in apps/api — hier nur Mathe.

import type { Cents } from "./money.js";

/** Zeitliche Granularität für Buckets und Periodenvergleiche (Kap. 29). */
export type Granularity = "DAY" | "WEEK" | "MONTH" | "YEAR";

/** Ein einzelner umsatzrelevanter Datenpunkt (z. B. eine Rechnung). */
export interface RevenuePoint {
  /** Zeitpunkt der Wirksamkeit (Rechnungsdatum). */
  at: Date;
  netCents: Cents;
}

/** Ein einzelner auftragsrelevanter Datenpunkt (z. B. ein Auftrag). */
export interface OrderPoint {
  /** Zeitpunkt der Entstehung (Auftragsdatum). */
  at: Date;
  netCents: Cents;
}

/** Aggregierter Eimer einer Periode. */
export interface RevenueBucket {
  /** Stabiler Periodenschlüssel, z. B. "2026-06-19" / "2026-W25" / "2026-06" / "2026". */
  key: string;
  /** Inklusiver Periodenbeginn (UTC). */
  start: Date;
  count: number;
  netCents: Cents;
}

/** Ergebnis eines Periodenvergleichs (aktuell vs. vorhergehend). */
export interface PeriodComparison {
  granularity: Granularity;
  current: RevenueBucket;
  previous: RevenueBucket | null;
  /** Absolute Veränderung der Nettoumsätze in Cent (current − previous). */
  deltaCents: Cents;
  /**
   * Relative Veränderung in Prozent (0..100-skaliert, kaufmännisch gerundet).
   * `null`, wenn die Vorperiode 0 war (Division nicht definiert).
   */
  deltaPercent: number | null;
}

const DAY_MS = 86_400_000;

/** UTC-Mitternacht des Tages von `d`. */
function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ISO-8601-Woche (Montag-basiert): Beginn der Woche als UTC-Mitternacht. */
function startOfIsoWeekUtc(d: Date): Date {
  const day = startOfDayUtc(d);
  // getUTCDay(): 0 = So … 6 = Sa. Montag = 1; auf Montag zurückrechnen.
  const dow = (day.getUTCDay() + 6) % 7; // 0 = Montag … 6 = Sonntag
  return new Date(day.getTime() - dow * DAY_MS);
}

/** ISO-Wochennummer + zugehöriges Wochenjahr (KW kann am Jahreswechsel abweichen). */
function isoWeekParts(d: Date): { year: number; week: number } {
  // Donnerstag der laufenden Woche bestimmt Jahr und Wochennummer (ISO 8601).
  const monday = startOfIsoWeekUtc(d);
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const firstThursday = (() => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    return new Date(startOfIsoWeekUtc(jan4).getTime() + 3 * DAY_MS);
  })();
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { year, week };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Periodenbeginn (UTC) für `at` bei gegebener Granularität. */
export function bucketStart(at: Date, g: Granularity): Date {
  switch (g) {
    case "DAY":
      return startOfDayUtc(at);
    case "WEEK":
      return startOfIsoWeekUtc(at);
    case "MONTH":
      return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    case "YEAR":
      return new Date(Date.UTC(at.getUTCFullYear(), 0, 1));
  }
}

/** Stabiler, sortierbarer Periodenschlüssel für `at` bei gegebener Granularität. */
export function bucketKey(at: Date, g: Granularity): string {
  switch (g) {
    case "DAY": {
      const s = startOfDayUtc(at);
      return `${s.getUTCFullYear()}-${pad2(s.getUTCMonth() + 1)}-${pad2(s.getUTCDate())}`;
    }
    case "WEEK": {
      const { year, week } = isoWeekParts(at);
      return `${year}-W${pad2(week)}`;
    }
    case "MONTH":
      return `${at.getUTCFullYear()}-${pad2(at.getUTCMonth() + 1)}`;
    case "YEAR":
      return String(at.getUTCFullYear());
  }
}

/** Beginn der unmittelbar vorhergehenden Periode (für den Periodenvergleich). */
export function previousBucketStart(start: Date, g: Granularity): Date {
  switch (g) {
    case "DAY":
      return new Date(start.getTime() - DAY_MS);
    case "WEEK":
      return new Date(start.getTime() - 7 * DAY_MS);
    case "MONTH":
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    case "YEAR":
      return new Date(Date.UTC(start.getUTCFullYear() - 1, 0, 1));
  }
}

/**
 * Aggregiert Datenpunkte zu nach Periodenschlüssel aufsteigend sortierten Eimern
 * (Umsatz- bzw. Auftragsübersicht, Kap. 29). Leere Perioden werden NICHT aufgefüllt —
 * nur Perioden mit Datenpunkten erscheinen.
 */
export function bucketRevenue(
  points: ReadonlyArray<RevenuePoint>,
  g: Granularity
): RevenueBucket[] {
  const byKey = new Map<string, RevenueBucket>();
  for (const p of points) {
    const key = bucketKey(p.at, g);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.netCents += p.netCents;
    } else {
      byKey.set(key, { key, start: bucketStart(p.at, g), count: 1, netCents: p.netCents });
    }
  }
  return [...byKey.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Veränderung in Prozent (kaufmännisch gerundet); `null`, wenn Basis 0. */
export function percentChange(current: Cents, previous: Cents): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/**
 * Vergleicht die Periode, die `reference` enthält, mit der unmittelbar vorhergehenden
 * Periode (Tag/Woche/Monat/Jahr, Kap. 29 „Vergleichen der verschiedenen Tage/Wochen/…").
 * Fehlende Perioden zählen als 0.
 */
export function comparePeriods(
  points: ReadonlyArray<RevenuePoint>,
  g: Granularity,
  reference: Date
): PeriodComparison {
  const curStart = bucketStart(reference, g);
  const prevStart = previousBucketStart(curStart, g);
  const buckets = bucketRevenue(points, g);
  const byKey = new Map(buckets.map((b) => [b.key, b] as const));

  const curKey = bucketKey(reference, g);
  const prevKey = bucketKey(prevStart, g);

  const current: RevenueBucket =
    byKey.get(curKey) ?? { key: curKey, start: curStart, count: 0, netCents: 0 };
  const previous: RevenueBucket | null = byKey.get(prevKey) ?? null;
  const prevNet = previous?.netCents ?? 0;

  return {
    granularity: g,
    current,
    previous,
    deltaCents: current.netCents - prevNet,
    deltaPercent: percentChange(current.netCents, prevNet),
  };
}

/** Gesamtsumme über alle Datenpunkte (Kennzahl der Übersicht). */
export function totalRevenueCents(points: ReadonlyArray<RevenuePoint>): Cents {
  return points.reduce((sum, p) => sum + p.netCents, 0);
}
