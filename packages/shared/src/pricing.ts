// Preis-/Aufschlagslogik — Kap. 4.4, 8.2, 11.
import { type Cents, roundCents } from "./money.js";

/** Standard-Aufschlagsfaktor Stickerei: VK = EK × 1,88 (Kap. 4.4). */
export const STICK_MARKUP_FACTOR = 1.88;

/**
 * VK aus EK über Aufschlagsfaktor (Stick: 1,88).
 * EK wird manuell erfasst; VK daraus berechnet (Kap. 4.4).
 */
export function markupVk(ekCents: Cents, factor: number = STICK_MARKUP_FACTOR): Cents {
  if (ekCents < 0) throw new Error("ekCents must be >= 0");
  if (factor <= 0) throw new Error("factor must be > 0");
  return roundCents(ekCents * factor);
}

/** Deckungsbeitrag = VK − EK (Kap. 4.4: DB bereits im Angebot sichtbar). */
export function deckungsbeitrag(vkCents: Cents, ekCents: Cents): Cents {
  return vkCents - ekCents;
}

/** DB-Marge in Prozent (0..1). */
export function dbMarge(vkCents: Cents, ekCents: Cents): number {
  if (vkCents <= 0) return 0;
  return deckungsbeitrag(vkCents, ekCents) / vkCents;
}
