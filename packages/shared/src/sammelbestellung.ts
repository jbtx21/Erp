// Sammelbestellung (Kap. 18.2): Periodenfenster je Intervall + Bündelung der Mitglieds-
// Aufträge (Artikel und Veredelung über alle Bestellungen zusammenfassen). Reine,
// IO-freie Logik — `today` wird übergeben (deterministisch, UTC).

export type SammelInterval = "WOECHENTLICH" | "MONATLICH" | "QUARTALSWEISE" | "HALBJAEHRLICH";

export interface Period {
  /** Periodenbeginn (inklusiv, 00:00 UTC) — identifiziert die Periode (Unique). */
  start: Date;
  /** Periodenende (exklusiv, Beginn der Folgeperiode). */
  end: Date;
  label: string;
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/** ISO-Wochennummer (1..53) zu einem Datum. */
function isoWeek(d: Date): { week: number; year: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mo=0
  date.setUTCDate(date.getUTCDate() - day + 3); // Donnerstag der Woche
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fd = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fd + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { week, year: date.getUTCFullYear() };
}

/** Aktuelles Periodenfenster für ein Intervall (KW / Monat / Quartal / Halbjahr). */
export function currentPeriod(interval: SammelInterval, today: Date): Period {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (interval) {
    case "WOECHENTLICH": {
      const day = (today.getUTCDay() + 6) % 7; // Mo=0
      const start = utcDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - day);
      const end = utcDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7);
      const { week, year } = isoWeek(today);
      return { start, end, label: `KW ${String(week).padStart(2, "0")}/${year}` };
    }
    case "MONATLICH": {
      const start = utcDate(y, m, 1);
      const end = utcDate(y, m + 1, 1);
      const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
      return { start, end, label: `${MONTHS[m]} ${y}` };
    }
    case "QUARTALSWEISE": {
      const q = Math.floor(m / 3); // 0..3
      const start = utcDate(y, q * 3, 1);
      const end = utcDate(y, q * 3 + 3, 1);
      return { start, end, label: `Q${q + 1}/${y}` };
    }
    case "HALBJAEHRLICH": {
      const h = m < 6 ? 0 : 1;
      const start = utcDate(y, h * 6, 1);
      const end = utcDate(y, h * 6 + 6, 1);
      return { start, end, label: `H${h + 1}/${y}` };
    }
  }
}

// ── Bündelung ────────────────────────────────────────────────────────────────

export interface BundleInputLine {
  kind: "TEXTIL" | "VEREDELUNG" | "SONSTIGE";
  /** Gruppierschlüssel (z. B. variantId; sonst Bezeichnung). */
  key: string;
  label: string;
  qty: number;
}

export interface BundledLine {
  key: string;
  label: string;
  qty: number;
  /** Anzahl beitragender Bestellpositionen (aus wie vielen Einzelbestellungen). */
  positionen: number;
}

export interface BundleResult {
  artikel: BundledLine[];
  veredelung: BundledLine[];
  gesamtArtikel: number;
  gesamtVeredelung: number;
}

function aggregate(lines: ReadonlyArray<BundleInputLine>): BundledLine[] {
  const map = new Map<string, BundledLine>();
  for (const l of lines) {
    const cur = map.get(l.key);
    if (cur) { cur.qty += l.qty; cur.positionen += 1; }
    else map.set(l.key, { key: l.key, label: l.label, qty: l.qty, positionen: 1 });
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label));
}

/**
 * Bündelt die Positionen aller Mitglieds-Aufträge einer Sammelbestellung: Artikel
 * (TEXTIL/SONSTIGE) und Veredelung (VEREDELUNG) werden je Schlüssel zusammengefasst
 * und nach Menge sortiert.
 */
export function bundleOrderLines(lines: ReadonlyArray<BundleInputLine>): BundleResult {
  const artikel = aggregate(lines.filter((l) => l.kind !== "VEREDELUNG"));
  const veredelung = aggregate(lines.filter((l) => l.kind === "VEREDELUNG"));
  return {
    artikel,
    veredelung,
    gesamtArtikel: artikel.reduce((s, a) => s + a.qty, 0),
    gesamtVeredelung: veredelung.reduce((s, a) => s + a.qty, 0),
  };
}
