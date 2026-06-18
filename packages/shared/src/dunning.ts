// Mahnwesen — Kap. 9.5. Testfall T-14.
// Überfällige offene Posten werden gestuft gemahnt (Stufe 1–3). Pro Mahnlauf
// wird höchstens eine Stufe hochgesetzt. Eine Mahnsperre (Kap. 9.5) verhindert
// jede Mahnung des Postens.

import type { Cents } from "./money.js";

export interface DunnableItem {
  id: string;
  openCents: Cents;
  dueDate: Date;
  /** Aktuelle Mahnstufe: 0 = noch nie gemahnt, 1..3. */
  dunningLevel: number;
  mahnsperre: boolean;
}

export interface DunningConfig {
  /** Tage nach Fälligkeit, ab denen Stufe 1/2/3 fällig wird. */
  level1AfterDays: number;
  level2AfterDays: number;
  level3AfterDays: number;
}

export const DEFAULT_DUNNING: DunningConfig = {
  level1AfterDays: 0, // ab Fälligkeit
  level2AfterDays: 14,
  level3AfterDays: 28,
};

export interface DunningProposal {
  itemId: string;
  fromLevel: number;
  toLevel: number;
  daysOverdue: number;
}

export interface DunningRun {
  proposals: DunningProposal[];
  /** Wegen Mahnsperre übersprungene Posten. */
  blocked: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysOverdue(dueDate: Date, today: Date): number {
  return Math.floor((today.getTime() - dueDate.getTime()) / DAY_MS);
}

/** Höchste fällige Stufe nach Überfälligkeitstagen. */
function targetLevel(overdue: number, cfg: DunningConfig): number {
  if (overdue >= cfg.level3AfterDays) return 3;
  if (overdue >= cfg.level2AfterDays) return 2;
  if (overdue >= cfg.level1AfterDays) return 1;
  return 0;
}

/**
 * Berechnet den Mahnlauf (T-14): überfällige, nicht gesperrte Posten, deren
 * fällige Stufe über der aktuellen liegt, werden um genau eine Stufe erhöht.
 * Mahnsperre → kein Vorschlag, Posten erscheint in `blocked`.
 */
export function computeDunning(
  items: ReadonlyArray<DunnableItem>,
  today: Date,
  cfg: DunningConfig = DEFAULT_DUNNING
): DunningRun {
  const proposals: DunningProposal[] = [];
  const blocked: string[] = [];

  for (const it of items) {
    if (it.openCents <= 0) continue; // bezahlt
    const overdue = daysOverdue(it.dueDate, today);
    const target = targetLevel(overdue, cfg);
    if (target <= it.dunningLevel) continue; // nichts Neues fällig

    if (it.mahnsperre) {
      blocked.push(it.id);
      continue;
    }

    proposals.push({
      itemId: it.id,
      fromLevel: it.dunningLevel,
      toLevel: it.dunningLevel + 1, // genau eine Stufe pro Lauf
      daysOverdue: overdue,
    });
  }

  return { proposals, blocked };
}
