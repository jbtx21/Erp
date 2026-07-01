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
  | "SCHULE"
  | "WIEDERVERKAEUFER"
  | "AGENTUR";

/**
 * Single Source of Truth für die Kundengruppen: Reihenfolge + deutsche Anzeigenamen. Frontend
 * (Selects/Matrizen), tRPC-Enums und Repos referenzieren NUR diese Liste — keine lokalen Kopien.
 */
export const PRICE_GROUPS: ReadonlyArray<{ kind: PriceGroupKind; label: string }> = [
  { kind: "STANDARD", label: "Standard" },
  { kind: "TOP", label: "Top" },
  { kind: "PREMIUM", label: "Premium" },
  { kind: "SCHULE", label: "Schule" },
  { kind: "WIEDERVERKAEUFER", label: "Wiederverkäufer" },
  { kind: "AGENTUR", label: "Agentur" },
];

/** Alle Kundengruppen-Schlüssel in fester Reihenfolge (für z.B. zod-Enums / Iteration). */
export const PRICE_GROUP_KINDS: ReadonlyArray<PriceGroupKind> = PRICE_GROUPS.map((g) => g.kind);

/** Deutscher Anzeigename einer Kundengruppe (Fallback = Schlüssel). */
export function priceGroupLabel(kind: PriceGroupKind): string {
  return PRICE_GROUPS.find((g) => g.kind === kind)?.label ?? kind;
}

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
 * Generische Stufenfunktion (eine Quelle für alle Staffel-Lookups): wählt aus beliebigen
 * Staffel-Zeilen die mit der größten `minMenge`, die `menge` nicht überschreitet (untere
 * Schranke). `null`, wenn keine Stufe greift. VK-Staffel, EK-Staffel und Stick-EK-Staffel
 * teilen exakt diese Semantik — ein Algorithmus statt drei Kopien.
 */
export function selectStaffel<T extends { minMenge: number }>(
  rows: ReadonlyArray<T>,
  menge: number
): T | null {
  if (menge < 0) throw new Error("menge must be >= 0");
  let best: T | null = null;
  for (const r of rows) {
    if (r.minMenge <= menge && (best === null || r.minMenge > best.minMenge)) {
      best = r;
    }
  }
  return best;
}

/**
 * Wählt die passende Preisstufe (VK): die mit der größten `minMenge`, die `menge` nicht
 * überschreitet. Gibt `null`, wenn keine Stufe greift (z. B. Menge unter der kleinsten
 * `minMenge`). Dünner Wrapper über {@link selectStaffel}.
 */
export function selectTier(
  tiers: ReadonlyArray<PriceTier>,
  menge: number
): PriceTier | null {
  return selectStaffel(tiers, menge);
}

/** Eine Staffelstufe der Angebots-Anzeige: VK + EK + DB je Mengengrenze (B4/D). */
export interface StaffelStufe {
  minMenge: number;
  vkCents: Cents;
  ekCents: Cents | null;
  dbCents: Cents | null;
  dbMargePct: number | null; // 0..1
  quelle: "KUNDE" | "GRUPPE" | "STANDARD";
}

export interface StaffelLadderInput {
  /** Basis-Staffel der Preisgruppe STANDARD (z. B. die Logo-/Veredelungs-Staffel). */
  standardTiers: ReadonlyArray<PriceTier>;
  /** Staffel der Preisgruppe der Firma. */
  groupTiers: ReadonlyArray<PriceTier>;
  /** Kundenindividuelle Staffel (höchste Präzedenz). */
  customerTiers: ReadonlyArray<PriceTier>;
  /** Bester Lieferanten-EK je Stück (null = kein EK hinterlegt → DB unbekannt). */
  ekCents: Cents | null;
  /**
   * Optionale EK-Mengenstaffel (z. B. Stick-EK je Stück gestaffelt nach Menge). Je VK-Stufe
   * gilt die EK-Stufe mit der größten `minMenge` ≤ Stufenmenge (Stufenfunktion). Leer/fehlend
   * → Rückfall auf den flachen `ekCents` für alle Stufen.
   */
  ekTiers?: ReadonlyArray<{ minMenge: number; ekCents: Cents }>;
}

/** EK für eine Mengengrenze aus der EK-Staffel (größte minMenge ≤ menge); sonst Fallback. */
function ekForMenge(ekTiers: ReadonlyArray<{ minMenge: number; ekCents: Cents }>, menge: number, fallback: Cents | null): Cents | null {
  return selectStaffel(ekTiers, menge)?.ekCents ?? fallback;
}

/**
 * Baut die Anzeige-Staffel (Mengenstaffel mit VK+EK+DB je Stufe) für die Positionsmaske
 * (B4/D, C+D): je Mengengrenze sticht KUNDE > GRUPPE > STANDARD. Liegt eine EK-Staffel vor
 * (`ekTiers`), gilt je Stufe der gestaffelte EK (Stufenfunktion), sonst der flache `ekCents`;
 * der DB variiert mit VK und EK. Aufsteigend nach minMenge sortiert.
 */
export function buildStaffelLadder(input: StaffelLadderInput): StaffelStufe[] {
  const byMenge = new Map<number, { vkCents: Cents; quelle: StaffelStufe["quelle"] }>();
  for (const t of input.standardTiers) byMenge.set(t.minMenge, { vkCents: t.netCents, quelle: "STANDARD" });
  for (const t of input.groupTiers) byMenge.set(t.minMenge, { vkCents: t.netCents, quelle: "GRUPPE" });
  for (const t of input.customerTiers) byMenge.set(t.minMenge, { vkCents: t.netCents, quelle: "KUNDE" });
  const ekTiers = input.ekTiers ?? [];
  return [...byMenge.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minMenge, v]) => {
      const ek = ekForMenge(ekTiers, minMenge, input.ekCents);
      return {
        minMenge,
        vkCents: v.vkCents,
        ekCents: ek,
        dbCents: ek === null ? null : deckungsbeitrag(v.vkCents, ek),
        dbMargePct: ek === null ? null : dbMarge(v.vkCents, ek),
        quelle: v.quelle,
      };
    });
}

export interface BasePriceSources {
  /** Kundenindividuelle Staffel — höchste Präzedenz. */
  customerTiers?: ReadonlyArray<PriceTier>;
  /** Preisgruppen-Staffel. */
  groupTiers?: ReadonlyArray<PriceTier>;
  /**
   * Basis-Staffel der Preisgruppe STANDARD (z. B. die Veredelungs-/Logo-Staffel). Greift für
   * ALLE Kunden als Basis, wenn keine kunden-/gruppenindividuelle Staffel sticht — Veredelung
   * kennt keine Kundengruppen (nur eine STANDARD-Staffel). Deckungsgleich mit `buildStaffelLadder`.
   */
  standardTiers?: ReadonlyArray<PriceTier>;
  /** Einzelpreis je Preisgruppe (manuelle Übersteuerung, bestehende Pflege). */
  groupPrices?: ReadonlyArray<VariantPrice>;
  /**
   * Berechneter Grund-VK aus dem Lieferanten-Aufschlag (EK × Faktor(Lieferant × Kundengruppe),
   * siehe supplier-markup.ts) — der DEFAULT-Preis des neuen Preismodells. Greift, wenn KEIN
   * manueller Einzelpreis der Kundengruppe gepflegt ist; nur die manuelle Übersteuerung gewinnt
   * davor. `null`/`undefined` ⇒ kein Lieferanten-Aufschlag verfügbar (Rückfall auf Altpfad).
   */
  computedBaseCents?: Cents | null;
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

  // STANDARD-Basisstaffel (z. B. Veredelung) — greift für alle Kunden, wenn keine kunden-/
  // gruppenindividuelle Staffel sticht. Gleiche Präzedenz wie im Anzeige-Ladder.
  const standardTier = selectTier(sources.standardTiers ?? [], menge);
  if (standardTier) return standardTier.netCents;

  // (3) Einzelpreis der Kundengruppe → (4) Standardpreis (Listenpreis) als letzter
  // Fallback. So liefert die EINE Pipeline auch unter der kleinsten Staffelschwelle einen
  // Preis (z. B. < Mindestmenge WIEDERVERKAEUFER) — der Standardpreis ist der Listenpreis,
  // den auch der Angebots-Editor verwendet (kein zweiter Preispfad). Fehlt selbst der
  // Standardpreis, ist das ein echter Pflegefehler und wird sichtbar geworfen (T-08).
  const prices = sources.groupPrices ?? [];
  const direct = prices.find((p) => p.priceGroup === group);
  if (direct) return direct.netCents;

  // (5) Grund-VK aus dem Lieferanten-Aufschlag (EK × Faktor) — der Default des neuen Preismodells
  // (Kap. 4.4). Greift VOR dem Alt-Fallback auf den STANDARD-Einzelpreis, sodass der berechnete
  // VK ohne gepflegte Einzelpreise in den Beleg durchschlägt.
  if (sources.computedBaseCents != null) return sources.computedBaseCents;

  const standard = prices.find((p) => p.priceGroup === "STANDARD");
  if (standard) return standard.netCents;

  throw new PriceResolutionError(
    `Kein VK für Preisgruppe ${group} und kein Standardpreis/Lieferanten-Aufschlag hinterlegt (Kap. 8.2 / T-08).`
  );
}
