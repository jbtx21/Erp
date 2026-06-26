// Echte Variantenstruktur — Kap. 2.1, 3.2, 8, 11. Testfall T-02.
// Make-or-break: Varianten werden über die Attribute "Farbe" × "Größe" gebildet
// (ersetzt CDH-Artikelduplikate). Die Attributnamen MÜSSEN exakt so heißen, damit
// das Shop-Mapping (Kap. 3.2) und die Auswertung funktionieren.

/** Pflicht-Attributnamen der Variante (Kap. 3.2 / T-02). Exakt diese Schreibweise. */
export const ATTR_FARBE = "Farbe";
export const ATTR_GROESSE = "Größe";
export const REQUIRED_ATTRS = [ATTR_FARBE, ATTR_GROESSE] as const;

export interface VariantAttribute {
  name: string;
  value: string;
}

/** Eindeutige Varianten-Attribute (Farbe + Größe), validiert. */
export interface ResolvedVariantAttributes {
  [ATTR_FARBE]: string;
  [ATTR_GROESSE]: string;
}

export class VariantAttributeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariantAttributeError";
  }
}

/**
 * Validiert und normalisiert die Attribute einer Variante. Es müssen exakt die
 * Pflichtattribute "Farbe" und "Größe" vorhanden sein (T-02). Doppelte oder
 * unbekannte Attributnamen werden abgelehnt, damit keine inkonsistenten
 * Variantenräume entstehen (Kap. 2.1).
 */
export function resolveVariantAttributes(
  attrs: VariantAttribute[]
): ResolvedVariantAttributes {
  const map = new Map<string, string>();
  for (const a of attrs) {
    const name = a.name.trim();
    const value = a.value.trim();
    if (!REQUIRED_ATTRS.includes(name as (typeof REQUIRED_ATTRS)[number])) {
      throw new VariantAttributeError(
        `Unbekanntes Variantenattribut "${a.name}". Erlaubt: ${REQUIRED_ATTRS.join(", ")} (T-02).`
      );
    }
    if (map.has(name)) {
      throw new VariantAttributeError(`Attribut "${name}" doppelt angegeben (T-02).`);
    }
    if (!value) {
      throw new VariantAttributeError(`Attribut "${name}" ohne Wert (T-02).`);
    }
    map.set(name, value);
  }
  for (const req of REQUIRED_ATTRS) {
    if (!map.has(req)) {
      throw new VariantAttributeError(`Pflichtattribut "${req}" fehlt (T-02).`);
    }
  }
  return {
    [ATTR_FARBE]: map.get(ATTR_FARBE) as string,
    [ATTR_GROESSE]: map.get(ATTR_GROESSE) as string,
  };
}

/**
 * Stabiler, vergleichbarer Schlüssel einer Variante innerhalb eines Artikels.
 * Reihenfolge-unabhängig; dient der Duplikatserkennung (eine Farbe×Größe je Artikel).
 */
export function variantKey(attrs: VariantAttribute[]): string {
  const r = resolveVariantAttributes(attrs);
  return `${ATTR_FARBE}=${r[ATTR_FARBE]}|${ATTR_GROESSE}=${r[ATTR_GROESSE]}`;
}

/**
 * SKU-tauglicher Code aus einem Attributwert: GROSSBUCHSTABEN, Umlaute aufgelöst,
 * alles Nicht-Alphanumerische zu „-". Deterministisch → stabile, kollisionsarme SKUs.
 * Beispiele: „French Navy" → „FRENCH-NAVY", „Größe 42" → „GROESSE-42", „XL" → „XL".
 */
export function skuCode(value: string): string {
  return value
    .trim()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Eine generierte Variante des Farbe×Größe-Rasters. */
export interface MatrixVariant {
  sku: string;
  farbe: string;
  groesse: string;
  /** Reihenfolge-unabhängiger Combo-Schlüssel (zur Duplikatserkennung). */
  key: string;
}

/**
 * Bildet das vollständige Farbe×Größe-Raster eines Artikels (kartesisches Produkt).
 * Leere Werte werden ignoriert, Duplikate je Achse entfernt; die Variant-SKU ist
 * `<articleSku>-<FARBE>-<GRÖSSE>` (per skuCode). Reine Funktion — kein IO.
 */
export function buildVariantMatrix(
  articleSku: string,
  farben: string[],
  groessen: string[]
): MatrixVariant[] {
  const uniq = (xs: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of xs) {
      const v = x.trim();
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      out.push(v);
    }
    return out;
  };
  const base = articleSku.trim();
  if (!base) throw new VariantAttributeError("Artikel-SKU fehlt für die Varianten-Matrix.");
  const fs = uniq(farben);
  const gs = uniq(groessen);
  const out: MatrixVariant[] = [];
  for (const farbe of fs) {
    for (const groesse of gs) {
      out.push({
        sku: `${base}-${skuCode(farbe)}-${skuCode(groesse)}`,
        farbe,
        groesse,
        key: `${ATTR_FARBE}=${farbe}|${ATTR_GROESSE}=${groesse}`,
      });
    }
  }
  return out;
}

/**
 * Liest Varianten-Attribute aus den meta_data einer WooCommerce-Bestellzeile.
 * Shops liefern Attribute typischerweise unter den Keys "Farbe"/"Größe" oder
 * "pa_farbe"/"pa_groesse" (WooCommerce-Slug-Konvention) — beides wird normalisiert.
 */
export function attributesFromWooMeta(
  meta: ReadonlyArray<{ key: string; value: unknown }> | undefined
): VariantAttribute[] {
  if (!meta) return [];
  const slugMap: Record<string, string> = {
    farbe: ATTR_FARBE,
    pa_farbe: ATTR_FARBE,
    color: ATTR_FARBE,
    "größe": ATTR_GROESSE,
    groesse: ATTR_GROESSE,
    pa_groesse: ATTR_GROESSE,
    size: ATTR_GROESSE,
  };
  const out: VariantAttribute[] = [];
  for (const m of meta) {
    const norm = slugMap[m.key.trim().toLowerCase()];
    if (norm && typeof m.value === "string" && m.value.trim()) {
      out.push({ name: norm, value: m.value.trim() });
    }
  }
  return out;
}
