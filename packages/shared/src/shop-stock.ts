// Shop-Bestandsmeldung (Pseudo-Bestand, Xentral-Vorbild). Der an den Shop gemeldete
// Bestand zieht einen Sicherheitspuffer vom verfügbaren Bestand ab, um Überverkauf zu
// vermeiden bzw. eine Reserve (z. B. für Eilaufträge, Muster) zu sichern. Reine Logik.

/**
 * An den Shop zu meldender Bestand: verfügbarer Bestand minus Puffer, nie negativ.
 * `available` = on-hand − reserviert (HAUPT-Lager). `puffer` ≥ 0.
 */
export function shopStockQty(available: number, puffer: number): number {
  return Math.max(0, available - Math.max(0, puffer));
}
