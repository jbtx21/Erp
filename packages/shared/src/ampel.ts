// Terminmanagement / Ampel — Kap. 35.4, 33.
// Ersetzt die Excel-Terminliste: jeder terminierte Vorgang bekommt eine Ampel
// aus Restlaufzeit bis zum Liefertermin. Bewusst einfach (kein APS, Kap. 33).

export type AmpelStatus = "GRUEN" | "GELB" | "ROT";

export interface AmpelConfig {
  /** Ab dieser Restlaufzeit (Tage) oder weniger wird es GELB. */
  warnDays: number;
}

export const DEFAULT_AMPEL: AmpelConfig = { warnDays: 3 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Restlaufzeit in ganzen Tagen (negativ = überfällig). */
export function daysUntil(dueDate: Date, today: Date): number {
  return Math.floor((dueDate.getTime() - today.getTime()) / DAY_MS);
}

/**
 * Ampel eines Vorgangs (Kap. 35.4): überfällig → ROT, knapp → GELB, sonst GRÜN.
 * Bereits erledigte Vorgänge sind immer GRÜN (kein Terminrisiko mehr).
 */
export function computeAmpel(
  dueDate: Date,
  today: Date,
  done = false,
  cfg: AmpelConfig = DEFAULT_AMPEL
): AmpelStatus {
  if (done) return "GRUEN";
  const remaining = daysUntil(dueDate, today);
  if (remaining < 0) return "ROT";
  if (remaining <= cfg.warnDays) return "GELB";
  return "GRUEN";
}

// ── Ebenenübergreifender Status (Kap. 35) ──────────────────────────────────

export type ProcessLevel = "ANGEBOT" | "AUFTRAG" | "PRODUKTION" | "VEREDLER";

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
}

/**
 * Baut die ebenenübergreifende Terminübersicht (Kap. 35.4), sortiert nach
 * Dringlichkeit (ROT zuerst, dann nach Restlaufzeit aufsteigend).
 */
export function buildAmpelOverview(
  processes: ReadonlyArray<TrackedProcess>,
  today: Date,
  cfg: AmpelConfig = DEFAULT_AMPEL
): AmpelRow[] {
  const order: Record<AmpelStatus, number> = { ROT: 0, GELB: 1, GRUEN: 2 };
  return processes
    .map((p) => ({
      ...p,
      ampel: computeAmpel(p.dueDate, today, p.done, cfg),
      daysRemaining: daysUntil(p.dueDate, today),
    }))
    .sort(
      (a, b) => order[a.ampel] - order[b.ampel] || a.daysRemaining - b.daysRemaining
    );
}
