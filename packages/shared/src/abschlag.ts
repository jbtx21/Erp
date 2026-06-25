// Abschlagsrechnung (Xentral „Abschlagsrechnung") — reine Berechnung der Teil-/Anzahlungs-
// beträge und der Restsumme zur Schlussrechnung. Beträge in Cent. IO-frei, testbar.

export class AbschlagError extends Error {}

export interface AbschlagBetrag {
  netCents: number;
  taxCents: number;
  grossCents: number;
  /** Gesetzter Prozentsatz (0..100), falls prozentual berechnet. */
  percent: number | null;
}

/**
 * Berechnet einen Abschlag aus dem Auftrags-Netto. Entweder prozentual (`percent`) oder als
 * fester Netto-Betrag (`netCents`). USt auf den Abschlag mit dem Auftrags-Steuersatz.
 */
export function computeAbschlag(
  orderNetCents: number,
  taxRatePct: number,
  spec: { percent?: number; netCents?: number }
): AbschlagBetrag {
  let net: number;
  let percent: number | null = null;
  if (spec.percent != null) {
    if (spec.percent <= 0 || spec.percent > 100) throw new AbschlagError("Prozentsatz muss zwischen 1 und 100 liegen.");
    percent = spec.percent;
    net = Math.round((orderNetCents * spec.percent) / 100);
  } else if (spec.netCents != null) {
    if (spec.netCents <= 0) throw new AbschlagError("Abschlagsbetrag muss positiv sein.");
    net = Math.round(spec.netCents);
  } else {
    throw new AbschlagError("Abschlag braucht percent oder netCents.");
  }
  const tax = Math.round((net * taxRatePct) / 100);
  return { netCents: net, taxCents: tax, grossCents: net + tax, percent };
}

export interface AbschlagSummary {
  orderNetCents: number;
  /** Summe der Abschlags-Nettobeträge. */
  sumNetCents: number;
  /** Verbleibender Netto-Betrag für die Schlussrechnung (≥ 0). */
  restNetCents: number;
  count: number;
}

/** Verdichtet die Abschläge eines Auftrags zur Restsumme (Schlussrechnung). */
export function abschlagSummary(
  orderNetCents: number,
  abschlaege: ReadonlyArray<{ netCents: number }>
): AbschlagSummary {
  const sum = abschlaege.reduce((s, a) => s + a.netCents, 0);
  return {
    orderNetCents,
    sumNetCents: sum,
    restNetCents: Math.max(0, orderNetCents - sum),
    count: abschlaege.length,
  };
}
