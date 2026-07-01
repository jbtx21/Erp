// Einrichtungskosten der Veredelung (Kap. 4.4) — reine Domäne, IO-frei.
//
// TEXMA-Regel: Einrichtung (Film/Sieb/Punch/Datei) hat FESTE Beträge — EK (unser Einkauf) UND
// VK (Kundenpreis) werden gepflegt, NICHT aus einem Aufschlag gerechnet. Sie fällt EINMALIG je
// Veredelungsposition an und NUR, wenn die Bestellmenge unter der Schwelle liegt (< 10 Teile);
// ab der Schwelle entfällt sie.

import { type Cents } from "./money.js";

/** TEXMA-Standard: Einrichtung nur unter 10 Teilen. */
export const EINRICHTUNG_SCHWELLE_STUECK = 10;

/** Feste Einrichtungskosten einer Veredelung: EK = unser Einkauf, VK = Kundenpreis. */
export interface EinrichtungKosten {
  ekCents: Cents;
  vkCents: Cents;
}

/**
 * Einrichtungskosten für eine konkrete Bestellmenge: die festen EK/VK, wenn die Menge unter der
 * Schwelle liegt (< 10 Teile), sonst `null` (ab der Schwelle entfällt die Einrichtung). Einmalig
 * je Position, nicht je Stück. `kosten` fehlt/null ⇒ keine Einrichtung gepflegt ⇒ null.
 */
export function einrichtungFuerMenge(
  menge: number,
  kosten: EinrichtungKosten | null | undefined,
  schwelleStueck: number = EINRICHTUNG_SCHWELLE_STUECK
): EinrichtungKosten | null {
  if (menge < 0) throw new Error("Menge darf nicht negativ sein.");
  if (!kosten) return null;
  if (kosten.ekCents < 0 || kosten.vkCents < 0) throw new Error("Einrichtungskosten dürfen nicht negativ sein.");
  if (menge >= schwelleStueck) return null;
  return { ekCents: kosten.ekCents, vkCents: kosten.vkCents };
}
