// Gutschein-Einlösung (Xentral „Gutscheine") — reine, IO-freie Logik. Beträge in Cent.

export interface RedeemResult {
  /** Tatsächlich eingelöster Betrag (≤ angefordert, ≤ Restguthaben). */
  appliedCents: number;
  /** Verbleibendes Restguthaben nach Einlösung. */
  remainingCents: number;
}

export class GutscheinError extends Error {}

/**
 * Löst einen Betrag gegen das Restguthaben ein. Über das Guthaben hinaus wird nur das
 * Guthaben angewendet (Teil-Einlösung), nie negativ. Gültigkeit/Aktiv-Status prüft der
 * aufrufende Service (er kennt das aktuelle Datum).
 */
export function redeemGutschein(remainingCents: number, requestedCents: number): RedeemResult {
  if (requestedCents <= 0) throw new GutscheinError("Einlösebetrag muss positiv sein.");
  if (remainingCents <= 0) throw new GutscheinError("Gutschein hat kein Restguthaben.");
  const applied = Math.min(requestedCents, remainingCents);
  return { appliedCents: applied, remainingCents: remainingCents - applied };
}

/** Ist der Gutschein am Stichtag gültig (aktiv, nicht abgelaufen, Restguthaben > 0)? */
export function isGutscheinValid(
  g: { active: boolean; validUntil: Date | null; remainingCents: number },
  today: Date
): boolean {
  if (!g.active || g.remainingCents <= 0) return false;
  if (g.validUntil && g.validUntil.getTime() < today.getTime()) return false;
  return true;
}
