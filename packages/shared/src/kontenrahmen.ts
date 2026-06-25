// Kontenrahmen SKR03 / SKR04 (Kap. 9.2) — die für TEXMA relevanten Standardkonten.
// Reine, IO-freie Zuordnung (Konto-Schlüssel → Kontonummer je Rahmen) als Grundlage für
// GuV-Gliederung, DATEV-Export und (künftig) doppelte Buchführung. Bewusst eine kuratierte
// Teilmenge, kein vollständiger DATEV-Kontenrahmen — erweiterbar.

export type Kontenrahmen = "SKR03" | "SKR04";

/** Fachlicher Schlüssel eines Standardkontos (rahmenunabhängig). */
export type KontoKey =
  | "erloese19"
  | "erloese7"
  | "erloeseSteuerfrei"
  | "wareneingang"
  | "fremdleistungen"
  | "debitoren"
  | "kreditoren"
  | "umsatzsteuer19"
  | "umsatzsteuer7"
  | "vorsteuer"
  | "bank"
  | "kasse"
  | "jahresergebnis";

interface KontoDef {
  key: KontoKey;
  label: string;
  /** GuV-Wirkung: ERTRAG/AUFWAND treiben die Gewinn- und Verlustrechnung; BILANZ nicht. */
  art: "ERTRAG" | "AUFWAND" | "BILANZ";
  skr03: string;
  skr04: string;
}

// Kontonummern nach DATEV-Standard SKR03/SKR04 (gängige Konten; Quelle: DATEV-Kontenrahmen).
export const KONTEN: ReadonlyArray<KontoDef> = [
  { key: "erloese19", label: "Erlöse 19% USt", art: "ERTRAG", skr03: "8400", skr04: "4400" },
  { key: "erloese7", label: "Erlöse 7% USt", art: "ERTRAG", skr03: "8300", skr04: "4300" },
  { key: "erloeseSteuerfrei", label: "Erlöse steuerfrei", art: "ERTRAG", skr03: "8120", skr04: "4120" },
  { key: "wareneingang", label: "Wareneingang/Materialaufwand", art: "AUFWAND", skr03: "3200", skr04: "5200" },
  { key: "fremdleistungen", label: "Fremdleistungen (Veredelung)", art: "AUFWAND", skr03: "3100", skr04: "5900" },
  { key: "debitoren", label: "Forderungen aLL (Debitoren)", art: "BILANZ", skr03: "1400", skr04: "1200" },
  { key: "kreditoren", label: "Verbindlichkeiten aLL (Kreditoren)", art: "BILANZ", skr03: "1600", skr04: "3300" },
  { key: "umsatzsteuer19", label: "Umsatzsteuer 19%", art: "BILANZ", skr03: "1776", skr04: "3806" },
  { key: "umsatzsteuer7", label: "Umsatzsteuer 7%", art: "BILANZ", skr03: "1771", skr04: "3801" },
  { key: "vorsteuer", label: "Abziehbare Vorsteuer", art: "BILANZ", skr03: "1576", skr04: "1406" },
  { key: "bank", label: "Bank", art: "BILANZ", skr03: "1200", skr04: "1800" },
  { key: "kasse", label: "Kasse", art: "BILANZ", skr03: "1000", skr04: "1600" },
  // Eigenkapital: das GuV-Ergebnis wird auf das Jahresüberschuss-/EK-Konto vorgetragen,
  // NICHT auf ein Erlöskonto. SKR04 2000 = Jahresüberschuss/Jahresfehlbetrag (kanonisch).
  { key: "jahresergebnis", label: "Jahresüberschuss/-fehlbetrag (EK)", art: "BILANZ", skr03: "0868", skr04: "2000" },
];

const BY_KEY = new Map<KontoKey, KontoDef>(KONTEN.map((k) => [k.key, k]));

/** Kontonummer eines Standardkontos im gewählten Kontenrahmen. */
export function konto(kr: Kontenrahmen, key: KontoKey): string {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unbekanntes Konto: ${key}`);
  return kr === "SKR03" ? def.skr03 : def.skr04;
}

/** Bezeichnung eines Standardkontos. */
export function kontoLabel(key: KontoKey): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** Erlöskonto je USt-Satz (0.19/0.07, sonst steuerfrei). */
export function erloeskonto(kr: Kontenrahmen, rate: number): string {
  if (Math.abs(rate - 0.19) < 1e-9) return konto(kr, "erloese19");
  if (Math.abs(rate - 0.07) < 1e-9) return konto(kr, "erloese7");
  return konto(kr, "erloeseSteuerfrei");
}

/** Konten eines Rahmens als Liste (Nummer + Label + Art) — für die Kontenrahmen-Ansicht. */
export function kontenliste(kr: Kontenrahmen): Array<{ key: KontoKey; nummer: string; label: string; art: KontoDef["art"] }> {
  return KONTEN.map((d) => ({ key: d.key, nummer: kr === "SKR03" ? d.skr03 : d.skr04, label: d.label, art: d.art }));
}

export const KONTENRAHMEN_LABEL: Record<Kontenrahmen, string> = {
  SKR03: "SKR03 (Prozessgliederung)",
  SKR04: "SKR04 (Abschlussgliederung)",
};
