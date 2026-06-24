// USt-IdNr-Prüfung (offline): Format je EU-Land + Prüfziffer für DE. Rein, IO-frei,
// deterministisch — fängt Tippfehler/falsche Strukturen ab. Eine qualifizierte
// Online-Bestätigung (VIES/BZSt) kann darauf aufsetzen.

export interface VatCheckResult {
  /** true, wenn Länderpräfix, Format und (bei DE) Prüfziffer stimmen. */
  valid: boolean;
  /** Normalisierte Eingabe (Großbuchstaben, ohne Leer-/Sonderzeichen). */
  normalized: string;
  /** Erkanntes Länderkürzel (z. B. "DE"), falls vorhanden. */
  country: string | null;
  /** Grund bei valid=false (für die Anzeige). */
  reason?: string;
}

// EU-Mitgliedstaaten (inkl. EL für Griechenland) mit USt-IdNr-Format als Regex
// (ohne das 2-stellige Länderpräfix). Quelle: EU-VO 904/2010 / VIES-Strukturregeln.
const PATTERNS: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^[01]\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^(\d{7}[A-W]|\d[A-Z*+]\d{5}[A-W]|\d{7}[A-W][AH])$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
};

/** Prüfziffer der deutschen USt-IdNr (9 Ziffern, ISO 7064 Mod 11,10 über die ersten 8). */
export function isValidGermanVatChecksum(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  let product = 10;
  for (let i = 0; i < 8; i++) {
    let sum = (Number(digits[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  const check = (11 - product) % 10;
  return check === Number(digits[8]);
}

/** Normalisiert (Großbuchstaben, ohne Leer-/Punkt-/Bindestrichzeichen). */
export function normalizeVatId(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-/]/g, "");
}

/**
 * Prüft eine USt-IdNr offline: Länderpräfix bekannt? Format korrekt? Bei DE zusätzlich
 * die Prüfziffer. Liefert valid + Begründung. Leerer Wert → valid=false (Grund „leer").
 */
export function validateVatId(raw: string): VatCheckResult {
  const normalized = normalizeVatId(raw ?? "");
  if (!normalized) return { valid: false, normalized, country: null, reason: "USt-IdNr ist leer." };
  const country = /^[A-Z]{2}/.test(normalized) ? normalized.slice(0, 2) : null;
  if (!country) return { valid: false, normalized, country: null, reason: "Kein Länderkürzel (z. B. DE…)." };
  const pattern = PATTERNS[country];
  if (!pattern) return { valid: false, normalized, country, reason: `Unbekanntes EU-Länderkürzel „${country}".` };
  const rest = normalized.slice(2);
  if (!pattern.test(rest)) return { valid: false, normalized, country, reason: `Ungültiges Format für ${country}.` };
  if (country === "DE" && !isValidGermanVatChecksum(rest)) {
    return { valid: false, normalized, country, reason: "Prüfziffer der deutschen USt-IdNr stimmt nicht." };
  }
  return { valid: true, normalized, country };
}
