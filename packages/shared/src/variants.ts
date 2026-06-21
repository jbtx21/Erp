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
