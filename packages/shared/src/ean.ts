// EAN/GTIN-Hilfen (B18). Normalisierung + Prüfziffernprüfung für EAN-8/12/13/14.
// Reine Logik — Basis für den automatischen EAN-Abgleich beim Stammdaten-Import.

/** Entfernt alles außer Ziffern (Leerzeichen, Bindestriche, führende Apostrophe aus Excel). */
export function normalizeGtin(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Prüft eine GTIN/EAN auf gültige Länge (8/12/13/14) und korrekte Prüfziffer
 * (gewichtete Quersumme 3-1-3-1… von rechts, mod 10).
 */
export function isValidGtin(raw: string): boolean {
  const s = normalizeGtin(raw);
  if (![8, 12, 13, 14].includes(s.length)) return false;
  const digits = s.split("").map((d) => Number(d));
  const check = digits.pop() ?? -1;
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += (digits[i] ?? 0) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === check;
}
