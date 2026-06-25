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

// ─────────────────────────────────────────────────────────────────────────────
// Mengenstaffel (B4, Kap. 4.4 / T-15). EINE Preisfindungs-Pipeline mit klarer
// Präzedenz — kein paralleler Mechanismus.
// ─────────────────────────────────────────────────────────────────────────────

/** Eine Staffelstufe: ab `minMenge` Stück gilt `netCents`. */
export interface PriceTier {
  minMenge: number;
  netCents: Cents;
}

/**
 * Wählt die passende Stufe: die mit der größten `minMenge`, die `menge` nicht
 * überschreitet. Gibt `null`, wenn keine Stufe greift (z. B. Menge unter der
 * kleinsten `minMenge`).
 */
export function selectTier(
  tiers: ReadonlyArray<PriceTier>,
  menge: number
): PriceTier | null {
  if (menge < 0) throw new Error("menge must be >= 0");
  let best: PriceTier | null = null;
  for (const t of tiers) {
    if (t.minMenge <= menge && (best === null || t.minMenge > best.minMenge)) {
      best = t;
    }
  }
  return best;
}

export interface BasePriceSources {
  /** Kundenindividuelle Staffel — höchste Präzedenz. */
  customerTiers?: ReadonlyArray<PriceTier>;
  /** Preisgruppen-Staffel. */
  groupTiers?: ReadonlyArray<PriceTier>;
  /** Einzelpreis je Preisgruppe (Fallback, bestehende Pflege). */
  groupPrices?: ReadonlyArray<VariantPrice>;
}

/**
 * Ermittelt den Netto-Basis-VK einer Variante in EINER Pipeline mit Präzedenz (B4):
 * (1) kundenindividuelle Staffel → (2) Preisgruppen-Staffel → (3) Einzelpreis der
 * Preisgruppe. Je Staffel-Ebene gilt die Stufe mit der größten `minMenge` ≤ Menge.
 * Greift keine Staffel, fällt es auf `resolvePrice` zurück (das bei fehlendem Preis
 * sichtbar wirft — kein stilles Ausweichen, Kap. 3.2 / T-08).
 * Die multiplikative Veredelungs-Staffel (`markup.ts`) wird separat aufaddiert.
 */
export function resolveBasePrice(
  sources: BasePriceSources,
  group: PriceGroupKind,
  menge: number
): Cents {
  const customer = selectTier(sources.customerTiers ?? [], menge);
  if (customer) return customer.netCents;

  const groupTier = selectTier(sources.groupTiers ?? [], menge);
  if (groupTier) return groupTier.netCents;

  // (3) Einzelpreis der Kundengruppe → (4) Standardpreis (Listenpreis) als letzter
  // Fallback. So liefert die EINE Pipeline auch unter der kleinsten Staffelschwelle einen
  // Preis (z. B. < Mindestmenge WIEDERVERKAEUFER) — der Standardpreis ist der Listenpreis,
  // den auch der Angebots-Editor verwendet (kein zweiter Preispfad). Fehlt selbst der
  // Standardpreis, ist das ein echter Pflegefehler und wird sichtbar geworfen (T-08).
  const prices = sources.groupPrices ?? [];
  const direct = prices.find((p) => p.priceGroup === group);
  if (direct) return direct.netCents;
  const standard = prices.find((p) => p.priceGroup === "STANDARD");
  if (standard) return standard.netCents;

  throw new PriceResolutionError(
    `Kein VK für Preisgruppe ${group} und kein Standardpreis hinterlegt (Kap. 8.2 / T-08).`
  );
}
