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

// ─────────────────────────────────────────────────────────────────────────────
// Preisgruppen-Auflösung — Kap. 8.2. ERP = Preis-Master (Kap. 3.2 / T-08).
// ─────────────────────────────────────────────────────────────────────────────

/** Preisgruppen (Kap. 2.1/8.2). Muss zu PriceGroupKind im Datenmodell passen. */
export type PriceGroupKind =
  | "STANDARD"
  | "TOP"
  | "PREMIUM"
  | "WIEDERVERKAEUFER"
  | "AGENTUR";

export interface VariantPrice {
  priceGroup: PriceGroupKind;
  netCents: Cents;
}

export class PriceResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceResolutionError";
  }
}

/**
 * Ermittelt den Netto-VK einer Variante für die Preisgruppe einer Firma (Kap. 8.2).
 * Fällt NICHT stillschweigend auf einen anderen Preis zurück — fehlt der Preis der
 * Gruppe, ist das ein Pflegefehler und wird sichtbar gemacht (Kap. 3.2 / T-08).
 */
export function resolvePrice(
  prices: ReadonlyArray<VariantPrice>,
  group: PriceGroupKind
): Cents {
  const hit = prices.find((p) => p.priceGroup === group);
  if (!hit) {
    throw new PriceResolutionError(
      `Kein VK für Preisgruppe ${group} hinterlegt (Kap. 8.2 / T-08).`
    );
  }
  return hit.netCents;
}
