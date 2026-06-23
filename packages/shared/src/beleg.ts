// Druckbelege (Lieferschein/Rechnung): reines Inhaltsmodell + Builder. IO-frei und
// testbar — das PDF-Rendering (pdf-lib) liegt in apps/api. Beträge in Cent rein,
// formatierte Euro-Strings raus (formatEur). Lieferschein ohne Preise.

import { formatEur, lineNet, type Cents } from "./money.js";

export interface BelegPosition {
  menge: number;
  bezeichnung: string;
  /** Formatierter Einzelpreis (nur Rechnung). */
  einzelpreis?: string;
  /** Formatierter Zeilenbetrag (nur Rechnung). */
  gesamt?: string;
}

export interface BelegSumme {
  label: string;
  value: string;
}

export type BelegTyp = "LIEFERSCHEIN" | "RECHNUNG";

export interface BelegDokument {
  typ: BelegTyp;
  titel: string;
  nummer: string;
  datum: string;
  absender: string[];
  empfaenger: string[];
  positionen: BelegPosition[];
  summen: BelegSumme[];
  hinweise: string[];
  /** Steuert die Preis-Spalten im Renderer. */
  zeigePreise: boolean;
}

/** Standard-Absender (Briefkopf). Später aus den Firmen-Einstellungen (Admin-Portal). */
export const ABSENDER_TEXMA: readonly string[] = [
  "TEXMA Textilveredelung GmbH",
  "Musterstraße 1 · 00000 Musterstadt",
  "info@texma-gmbh.de",
];

function formatDatum(d: Date): string {
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export interface LieferscheinInput {
  nummer: string;
  datum: Date;
  empfaenger: string[];
  positionen: { menge: number; bezeichnung: string }[];
  hinweise?: string[];
  /** Briefkopf (Admin-Portal); Default: ABSENDER_TEXMA. */
  absender?: string[];
}

/** Lieferschein — bewusst OHNE Preise (Kap. 12: Produktion sieht keine Beträge). */
export function lieferscheinDokument(input: LieferscheinInput): BelegDokument {
  return {
    typ: "LIEFERSCHEIN",
    titel: "Lieferschein",
    nummer: input.nummer,
    datum: formatDatum(input.datum),
    absender: input.absender && input.absender.length > 0 ? input.absender : [...ABSENDER_TEXMA],
    empfaenger: input.empfaenger,
    positionen: input.positionen.map((p) => ({ menge: p.menge, bezeichnung: p.bezeichnung })),
    summen: [],
    hinweise: input.hinweise ?? ["Bitte prüfen Sie die Lieferung auf Vollständigkeit und Unversehrtheit."],
    zeigePreise: false,
  };
}

export interface RechnungInput {
  nummer: string;
  datum: Date;
  empfaenger: string[];
  positionen: { menge: number; bezeichnung: string; einzelpreisCents: Cents }[];
  netCents: Cents;
  taxCents: Cents;
  grossCents: Cents;
  hinweise?: string[];
  /** Briefkopf (Admin-Portal); Default: ABSENDER_TEXMA. */
  absender?: string[];
}

/** Rechnung — mit Einzel-/Zeilenpreisen und Netto/USt/Brutto-Summen. */
export function rechnungDokument(input: RechnungInput): BelegDokument {
  return {
    typ: "RECHNUNG",
    titel: "Rechnung",
    nummer: input.nummer,
    datum: formatDatum(input.datum),
    absender: input.absender && input.absender.length > 0 ? input.absender : [...ABSENDER_TEXMA],
    empfaenger: input.empfaenger,
    positionen: input.positionen.map((p) => ({
      menge: p.menge,
      bezeichnung: p.bezeichnung,
      einzelpreis: formatEur(p.einzelpreisCents),
      gesamt: formatEur(lineNet(p.menge, p.einzelpreisCents)),
    })),
    summen: [
      { label: "Netto", value: formatEur(input.netCents) },
      { label: "USt", value: formatEur(input.taxCents) },
      { label: "Brutto", value: formatEur(input.grossCents) },
    ],
    hinweise: input.hinweise ?? ["Zahlbar ohne Abzug gemäß vereinbartem Zahlungsziel."],
    zeigePreise: true,
  };
}
