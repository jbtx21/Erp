// Rückwärtsterminierung (B9, Kap. 35.2). Aus dem zugesagten Liefertermin und den
// Durchlaufzeiten der (Veredelungs-)Stufen den spätesten Starttermin ableiten. Rein,
// IO-frei. Stufen laufen sequenziell; die letzte endet am Liefertermin.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Verschiebt ein Datum um `days` Tage (negativ = zurück). */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
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
