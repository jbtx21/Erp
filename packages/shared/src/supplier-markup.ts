// Lieferanten-Aufschlagsmodell (Kap. 4.4 / 8.2): Grund-VK = EK × Faktor(Lieferant × Kundengruppe).
// Jeder Artikel hat GENAU EINEN (Textil-)Lieferanten. Jeder Lieferant pflegt eigene, FLACHE
// Faktoren je Kundengruppe (Standard/Top/Premium/Schule/Wiederverkäufer/Agentur). Ein Kunde kann
// je Lieferant in einer ANDEREN Gruppe sein (Premium@HAKRO, Standard@Stanley …). Reine Auflösung
// ohne IO; Persistenz/Repositories liegen in der API. Faktoren werden als Basispunkte gehalten
// (factorBp = Faktor × 10000), damit keine Floats in der DB landen (Kap. „Geld immer in Cent").
import { type Cents, roundCents } from "./money.js";
import { type PriceGroupKind, PriceResolutionError } from "./pricing.js";

/** Skalierung der Aufschlagsfaktoren: Faktor 1,88 ⇒ factorBp 18800. */
export const FACTOR_BP_SCALE = 10000;

/** Faktor (z. B. 1,88) → Basispunkte (18800). Wirft bei nicht-positivem Faktor. */
export function factorToBp(factor: number): number {
  if (!(factor > 0)) throw new Error("Aufschlagsfaktor muss > 0 sein.");
  return Math.round(factor * FACTOR_BP_SCALE);
}

/** Basispunkte (18800) → Faktor (1,88). */
export function bpToFactor(factorBp: number): number {
  return factorBp / FACTOR_BP_SCALE;
}

/** Ein Aufschlag des Lieferanten für eine Kundengruppe (flach, keine Staffel). */
export interface SupplierMarkupEntry {
  priceGroup: PriceGroupKind;
  factorBp: number;
}

/**
 * Kundengruppe für genau EINEN Lieferanten auflösen: kundenindividuelle Zuordnung je Lieferanten
 * (`CustomerSupplierPriceGroup`) gewinnt; sonst die globale Standard-Gruppe der Firma
 * (`Company.priceGroup`); sonst STANDARD. So ist „Premium@HAKRO, aber Standard@Stanley" möglich.
 */
export function resolveCustomerPriceGroup(opts: {
  perSupplierGroup?: PriceGroupKind | null;
  companyDefaultGroup?: PriceGroupKind | null;
}): PriceGroupKind {
  return opts.perSupplierGroup ?? opts.companyDefaultGroup ?? "STANDARD";
}

export interface SupplierVkInput {
  /** Bester Lieferanten-EK der Variante (Cent). */
  ekCents: Cents;
  /** Aufschlagsmatrix des (genau einen) Artikel-Lieferanten, je Kundengruppe. */
  markups: ReadonlyArray<SupplierMarkupEntry>;
  /** Bereits aufgelöste Kundengruppe für DIESEN Lieferanten (siehe resolveCustomerPriceGroup). */
  group: PriceGroupKind;
  /**
   * Manueller Festpreis-Override (gepflegter `PriceGroupPrice`/Kundenpreis) — gewinnt IMMER, falls
   * gesetzt. So bleibt eine händische Übersteuerung des berechneten Grund-VK möglich (Kap. 4.4).
   */
  overrideNetCents?: Cents | null;
}

export interface ResolvedSupplierVk {
  vkCents: Cents;
  /** Genutzter Faktor in Basispunkten (null beim Override — kein Faktor angewandt). */
  factorBp: number | null;
  /** Tatsächlich angewandte Kundengruppe (kann auf STANDARD zurückfallen). */
  group: PriceGroupKind;
  source: "override" | "gruppe" | "standard";
}

/**
 * Grund-VK einer Variante über das Lieferanten-Aufschlagsmodell:
 * `VK = round(EK × Faktor(Lieferant, Kundengruppe))`.
 * Präzedenz: (1) manueller Override → (2) Faktor der Kundengruppe → (3) Standard-Faktor des
 * Lieferanten (Grund-VK). Fehlt selbst der Standard-Faktor, ist das ein Pflegefehler und wird
 * sichtbar geworfen — kein stilles Ausweichen (Kap. 3.2 / T-08).
 */
export function resolveSupplierVk(input: SupplierVkInput): ResolvedSupplierVk {
  if (input.ekCents < 0) throw new Error("ekCents must be >= 0");

  if (input.overrideNetCents != null) {
    return { vkCents: input.overrideNetCents, factorBp: null, group: input.group, source: "override" };
  }

  const direct = input.markups.find((m) => m.priceGroup === input.group);
  if (direct) {
    return { vkCents: applyFactor(input.ekCents, direct.factorBp), factorBp: direct.factorBp, group: input.group, source: "gruppe" };
  }

  // Rückfall auf den Standard-Faktor des Lieferanten = Grund-VK (kein Gruppen-Faktor gepflegt).
  const std = input.markups.find((m) => m.priceGroup === "STANDARD");
  if (std) {
    return { vkCents: applyFactor(input.ekCents, std.factorBp), factorBp: std.factorBp, group: "STANDARD", source: "standard" };
  }

  throw new PriceResolutionError(
    `Kein Aufschlagsfaktor für die Kundengruppe ${input.group} und kein Standard-Faktor des Lieferanten hinterlegt (Kap. 4.4 / T-08).`
  );
}

/** VK = round(EK × factorBp/10000). Faktor muss > 0 sein. */
function applyFactor(ekCents: Cents, factorBp: number): Cents {
  if (!(factorBp > 0)) throw new Error("Aufschlagsfaktor (Bp) muss > 0 sein.");
  return roundCents((ekCents * factorBp) / FACTOR_BP_SCALE);
}

