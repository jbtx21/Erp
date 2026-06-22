// Textil-PIM-Validierung (B18, Kap. 3). Zwei rechtlich/qualitativ relevante Regeln:
// 1) GTIN-13-Prüfziffer (GS1 / EAN-13) — verhindert falsch erfasste Barcodes.
// 2) Faserzusammensetzung als Pflicht (EU-Textilkennzeichnungs-VO 1007/2011) vor
//    Verkaufsfreigabe. Rein/IO-frei.

/** Prüfziffer (13. Stelle) zu den ersten 12 Ziffern einer GTIN-13/EAN-13. */
export function gtin13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error("gtin13CheckDigit erwartet genau 12 Ziffern");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += (first12.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** Gültige GTIN-13/EAN-13: 13 Ziffern mit korrekter Prüfziffer. */
export function isValidGtin13(gtin: string): boolean {
  if (!/^\d{13}$/.test(gtin)) return false;
  return gtin13CheckDigit(gtin.slice(0, 12)) === gtin.charCodeAt(12) - 48;
}

export interface TextileLabeling {
  /** Faserzusammensetzung, z. B. "100% Baumwolle". */
  materialComposition?: string | null;
}

/** EU-Textilkennzeichnung (VO 1007/2011): Faserzusammensetzung ist Pflicht. */
export function isLabelingComplete(a: TextileLabeling): boolean {
  return (
    typeof a.materialComposition === "string" &&
    a.materialComposition.trim().length > 0
  );
}

export class LabelingIncompleteError extends Error {
  constructor() {
    super(
      "Faserzusammensetzung fehlt (EU-VO 1007/2011) — Artikel nicht verkaufsfähig."
    );
    this.name = "LabelingIncompleteError";
  }
}

/** Wirft, wenn die Pflicht-Kennzeichnung für die Verkaufsfreigabe fehlt. */
export function assertSellable(a: TextileLabeling): void {
  if (!isLabelingComplete(a)) throw new LabelingIncompleteError();
}

export class InvalidGtinError extends Error {
  constructor(gtin: string) {
    super(`Ungültige GTIN-13: ${gtin} (Prüfziffer/Format).`);
    this.name = "InvalidGtinError";
  }
}

/** Wirft bei ungültiger GTIN-13; sonst gibt sie die GTIN zurück. */
export function assertGtin13(gtin: string): string {
  if (!isValidGtin13(gtin)) throw new InvalidGtinError(gtin);
  return gtin;
}

// ── PIM-Vollständigkeit (Datenqualität vor Kanal-Veröffentlichung) ────────────

export interface ArticlePimFields {
  description: string;
  brand: string;
  materialComposition: string;
  careInstructions: string;
  hsCode: string;
  originCountry: string;
}

export interface PimFieldDef {
  key: keyof ArticlePimFields;
  label: string;
}

export const PIM_FIELDS: ReadonlyArray<PimFieldDef> = [
  { key: "description", label: "Beschreibung" },
  { key: "brand", label: "Marke" },
  { key: "materialComposition", label: "Material" },
  { key: "careInstructions", label: "Pflegehinweis" },
  { key: "hsCode", label: "Zolltarifnummer" },
  { key: "originCountry", label: "Ursprungsland" },
];

export interface PimCompleteness {
  filled: number;
  total: number;
  percent: number;
  missing: string[];
}

/** Bewertet die Vollständigkeit der PIM-Felder eines Artikels (welche fehlen). */
export function articleCompleteness(fields: Partial<ArticlePimFields>): PimCompleteness {
  const missing: string[] = [];
  let filled = 0;
  for (const f of PIM_FIELDS) {
    const v = fields[f.key];
    if (v && String(v).trim() !== "") filled++;
    else missing.push(f.label);
  }
  const total = PIM_FIELDS.length;
  return { filled, total, percent: Math.round((filled / total) * 100), missing };
}
