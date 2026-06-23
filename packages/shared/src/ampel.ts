// Terminmanagement / Ampel — Kap. 35.4, 33.
// Ersetzt die Excel-Terminliste: jeder terminierte Vorgang bekommt eine Ampel
// aus Restlaufzeit bis zum Liefertermin. Bewusst einfach (kein APS, Kap. 33).

import { csvField } from "./csv.js";

export type AmpelStatus = "GRUEN" | "GELB" | "ROT";

export type ProcessLevel = "ANGEBOT" | "AUFTRAG" | "PRODUKTION" | "VEREDLER";

export interface AmpelConfig {
  /** Ab dieser Restlaufzeit (Tage) oder weniger wird es GELB. */
  warnDays: number;
  /**
   * Ebenenspezifische Warnschwellen (Tage). Veredler-Rücklauf braucht typischerweise
   * mehr Vorlauf als interne Schritte. Fehlt eine Ebene, gilt `warnDays`.
   */
  warnDaysByLevel?: Partial<Record<ProcessLevel, number>>;
  /** Überfälligkeit über dieser Tagesgrenze → Eskalationsstufe 2 (kritisch). */
  eskalationDays: number;
}

export const DEFAULT_AMPEL: AmpelConfig = { warnDays: 3, eskalationDays: 3 };

/** Effektive Warnschwelle für eine Ebene (ebenenspezifisch, sonst global). */
export function warnDaysFor(level: ProcessLevel | undefined, cfg: AmpelConfig): number {
  return (level && cfg.warnDaysByLevel?.[level]) ?? cfg.warnDays;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Restlaufzeit in ganzen Tagen (negativ = überfällig). */
export function daysUntil(dueDate: Date, today: Date): number {
  return Math.floor((dueDate.getTime() - today.getTime()) / DAY_MS);
}

/**
 * Ampel eines Vorgangs (Kap. 35.4): überfällig → ROT, knapp → GELB, sonst GRÜN.
 * Bereits erledigte Vorgänge sind immer GRÜN (kein Terminrisiko mehr).
 * Die GELB-Schwelle kann je Ebene abweichen (warnDaysFor).
 */
export function computeAmpel(
  dueDate: Date,
  today: Date,
  done = false,
  cfg: AmpelConfig = DEFAULT_AMPEL,
  level?: ProcessLevel
): AmpelStatus {
  if (done) return "GRUEN";
  const remaining = daysUntil(dueDate, today);
  if (remaining < 0) return "ROT";
  if (remaining <= warnDaysFor(level, cfg)) return "GELB";
  return "GRUEN";
}

/**
 * Eskalationsstufe (0..2): 0 = im Plan/GELB, 1 = überfällig, 2 = kritisch überfällig
 * (über `eskalationDays` hinaus). Erledigte Vorgänge sind 0.
 */
export function escalationLevel(
  dueDate: Date,
  today: Date,
  done = false,
  cfg: AmpelConfig = DEFAULT_AMPEL
): 0 | 1 | 2 {
  if (done) return 0;
  const remaining = daysUntil(dueDate, today);
  if (remaining >= 0) return 0;
  return -remaining > cfg.eskalationDays ? 2 : 1;
}

// ── Ebenenübergreifender Status (Kap. 35) ──────────────────────────────────

export interface TrackedProcess {
  id: string;
  level: ProcessLevel;
  label: string;
  dueDate: Date;
  done: boolean;
}

export interface AmpelRow extends TrackedProcess {
  ampel: AmpelStatus;
  daysRemaining: number;
  /** Überfällige Tage (0, wenn nicht überfällig). */
  overdueDays: number;
  /** Eskalationsstufe 0..2 (s. escalationLevel). */
  escalation: 0 | 1 | 2;
}

/**
 * Baut die ebenenübergreifende Terminübersicht (Kap. 35.4), sortiert nach
 * Dringlichkeit: Eskalationsstufe absteigend, dann Ampel (ROT zuerst), dann
 * Restlaufzeit aufsteigend.
 */
export function buildAmpelOverview(
  processes: ReadonlyArray<TrackedProcess>,
  today: Date,
  cfg: AmpelConfig = DEFAULT_AMPEL
): AmpelRow[] {
  const order: Record<AmpelStatus, number> = { ROT: 0, GELB: 1, GRUEN: 2 };
  return processes
    .map((p) => {
      const daysRemaining = daysUntil(p.dueDate, today);
      return {
        ...p,
        ampel: computeAmpel(p.dueDate, today, p.done, cfg, p.level),
        daysRemaining,
        overdueDays: p.done || daysRemaining >= 0 ? 0 : -daysRemaining,
        escalation: escalationLevel(p.dueDate, today, p.done, cfg),
      };
    })
    .sort(
      (a, b) =>
        b.escalation - a.escalation ||
        order[a.ampel] - order[b.ampel] ||
        a.daysRemaining - b.daysRemaining
    );
}

export interface AmpelSummary {
  total: number;
  rot: number;
  gelb: number;
  gruen: number;
  /** Überfällige (nicht erledigte) Vorgänge. */
  overdue: number;
  /** Kritisch überfällige (Eskalationsstufe 2). */
  kritisch: number;
  /** Dringendster offener Vorgang (oberste Zeile) oder null. */
  mostUrgent: AmpelRow | null;
  /** Statuszählung je Ebene. */
  byLevel: Record<ProcessLevel, { rot: number; gelb: number; gruen: number }>;
}

const LEVELS: ProcessLevel[] = ["ANGEBOT", "AUFTRAG", "PRODUKTION", "VEREDLER"];

/** Verdichtet die Ampel-Übersicht zu Dashboard-Kennzahlen (Kap. 35.4). */
export function summarizeAmpel(rows: ReadonlyArray<AmpelRow>): AmpelSummary {
  const byLevel = Object.fromEntries(
    LEVELS.map((l) => [l, { rot: 0, gelb: 0, gruen: 0 }])
  ) as AmpelSummary["byLevel"];
  let rot = 0;
  let gelb = 0;
  let gruen = 0;
  let overdue = 0;
  let kritisch = 0;
  for (const r of rows) {
    if (r.ampel === "ROT") rot += 1;
    else if (r.ampel === "GELB") gelb += 1;
    else gruen += 1;
    const bucket = byLevel[r.level];
    if (r.ampel === "ROT") bucket.rot += 1;
    else if (r.ampel === "GELB") bucket.gelb += 1;
    else bucket.gruen += 1;
    if (r.overdueDays > 0) overdue += 1;
    if (r.escalation === 2) kritisch += 1;
  }
  const mostUrgent = rows.find((r) => !r.done) ?? null;
  return { total: rows.length, rot, gelb, gruen, overdue, kritisch, mostUrgent, byLevel };
}

// ── Arbeitsliste-Export (Notbetrieb, K-17) ──────────────────────────────────
// Read-only-Druckliste der Termin-Ampel: bei Internet-Ausfall arbeitet das Büro mit
// dem PDF/CSV weiter. Reine Formatierung → identisch für PDF (Server) und CSV (UI/Server).

export const AMPEL_WORKLIST_COLUMNS = ["Ebene", "Vorgang", "Termin", "Status", "Verbleibend (Tage)", "Eskalation"] as const;

const AMPEL_LEVEL_DE: Record<ProcessLevel, string> = { ANGEBOT: "Angebot", AUFTRAG: "Auftrag", PRODUKTION: "Produktion", VEREDLER: "Veredler" };
const AMPEL_STATUS_DE: Record<AmpelStatus, string> = { GRUEN: "Im Plan", GELB: "Knapp", ROT: "Überfällig" };
const escalationLabel = (e: 0 | 1 | 2): string => (e === 2 ? "kritisch" : e === 1 ? "erhöht" : "—");

/** Formatiert die Ampel-Zeilen als druckbare Tabelle (Strings, eine Zeile je Vorgang). */
export function ampelWorklistRows(rows: ReadonlyArray<AmpelRow>): string[][] {
  return rows.map((r) => [
    AMPEL_LEVEL_DE[r.level],
    r.label,
    r.dueDate.toISOString().slice(0, 10),
    AMPEL_STATUS_DE[r.ampel],
    r.overdueDays > 0 ? `−${r.overdueDays}` : String(r.daysRemaining),
    escalationLabel(r.escalation),
  ]);
}

/** Arbeitsliste als CSV (`;`-getrennt, RFC-4180-Escaping) für den Offline-Notbetrieb. */
export function ampelWorklistCsv(rows: ReadonlyArray<AmpelRow>): string {
  const header = AMPEL_WORKLIST_COLUMNS.join(";");
  const lines = ampelWorklistRows(rows).map((cols) => cols.map(csvField).join(";"));
  return [header, ...lines].join("\n");
}
