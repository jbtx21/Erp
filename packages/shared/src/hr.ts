// Personalwesen (HR): reine Urlaubs-Hilfslogik. Werktage (Mo–Fr) zwischen zwei Daten
// inklusive; Resturlaub = Jahresanspruch − genehmigte Tage. IO-frei.

/** Anzahl Werktage (Mo–Fr) im Zeitraum [von, bis] inklusive beider Tage. */
export function workdaysBetween(von: Date, bis: Date): number {
  const start = new Date(Date.UTC(von.getUTCFullYear(), von.getUTCMonth(), von.getUTCDate()));
  const end = new Date(Date.UTC(bis.getUTCFullYear(), bis.getUTCMonth(), bis.getUTCDate()));
  if (end.getTime() < start.getTime()) return 0;
  let count = 0;
  for (let d = start; d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** Resturlaub: Jahresanspruch − bereits genehmigte Tage (nie negativ angezeigt). */
export function remainingVacation(jahresanspruch: number, genehmigteTage: number): number {
  return jahresanspruch - genehmigteTage;
}
