// Teil-Erfüllungs-Status (ERP-Grundfunktion / G-4). Das delivery_status/billing_status-
// Muster jedes ERP: aus Soll und Erledigtem den Status NICHT/TEILWEISE/VOLL ableiten.
// Rein und IO-frei; arbeitet auf Mengen ODER Beträgen (Cent).

export type FulfillmentStatus = "NICHT" | "TEILWEISE" | "VOLL";

/**
 * total = Soll (Menge oder Betrag), done = bereits erledigt.
 * done ≤ 0 → NICHT · done ≥ total → VOLL · sonst TEILWEISE.
 * total ≤ 0 (nichts zu erfüllen) gilt als VOLL.
 */
export function fulfillmentStatus(total: number, done: number): FulfillmentStatus {
  if (total <= 0) return "VOLL";
  if (done <= 0) return "NICHT";
  if (done >= total) return "VOLL";
  return "TEILWEISE";
}
