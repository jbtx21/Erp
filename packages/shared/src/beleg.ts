// Druckbelege (Lieferschein/Rechnung): reines Inhaltsmodell + Builder. IO-frei und
// testbar — das PDF-Rendering (pdf-lib) liegt in apps/api. Beträge in Cent rein,
// formatierte Euro-Strings raus (formatEur). Lieferschein ohne Preise.

import { formatEur, lineNet, type Cents } from "./money.js";

export interface BelegPosition {
  menge: number;
  bezeichnung: string;
  /** Formatierter Einzelpreis (nur Rechnung). Bei Rabatt = VK-Listenpreis vor Rabatt. */
  einzelpreis?: string;
  /** Formatierter Positionsrabatt, z. B. "10 %" (nur wenn gewährt). */
  rabatt?: string;
  /** Formatierter Zeilenbetrag (nur Rechnung). */
  gesamt?: string;
}

export interface BelegSumme {
  label: string;
  value: string;
}

export type BelegTyp = "LIEFERSCHEIN" | "RECHNUNG" | "LAUFZETTEL" | "ANGEBOT" | "AUFTRAGSBESTAETIGUNG" | "GUTSCHRIFT" | "MAHNUNG";

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

/**
 * Strukturiertes Firmenprofil (Briefkopf, Fußzeile, Bank, Steuer) für die Belege. Wird im
 * Admin-Portal gepflegt (AppSetting `company_profile`) und vom Beleg-Renderer für Kopf + Fußzeile
 * genutzt. Default = TEXMA-Stammdaten (aus den echten Belegen).
 */
export interface FirmenProfil {
  name: string;
  street: string;
  zipCity: string;
  tel: string;
  mail: string;
  web: string;
  ustId: string;
  gf: string;
  bankName: string;
  iban: string;
  bic: string;
}

export const FIRMA_DEFAULT: FirmenProfil = {
  name: "TEXMA Textilmarketing GmbH",
  street: "Benzstraße 32",
  zipCity: "71083 Herrenberg",
  tel: "07032 7999281",
  mail: "info@texma-gmbh.de",
  web: "www.texma-gmbh.de",
  ustId: "DE 225496461",
  gf: "Herbert Bökle, Jannik Bökle",
  bankName: "Volksbank in der Region eG",
  iban: "DE37 6039 1310 0767 5040 03",
  bic: "GENODES1VBH",
};

/** Einzeiliger Briefkopf-Absender aus dem Firmenprofil (z. B. über dem Empfängerblock). */
export function briefkopfZeile(f: FirmenProfil): string {
  return `${f.name}   ${f.street}   ${f.zipCity}`;
}

/** Standard-Absender (Briefkopf) als Zeilen — abgeleitet aus dem Firmenprofil-Default. */
export const ABSENDER_TEXMA: readonly string[] = [
  FIRMA_DEFAULT.name,
  `${FIRMA_DEFAULT.street} · ${FIRMA_DEFAULT.zipCity}`,
  FIRMA_DEFAULT.mail,
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
    // Kundenseitiger Lieferschein: Bezugsquelle (intern/extern/Veredler) ausblenden.
    positionen: input.positionen.map((p) => ({ menge: p.menge, bezeichnung: redactKundenbezeichnung(p.bezeichnung) })),
    summen: [],
    hinweise: input.hinweise ?? ["Bitte prüfen Sie die Lieferung auf Vollständigkeit und Unversehrtheit."],
    zeigePreise: false,
  };
}

export interface LaufzettelInput {
  nummer: string;
  datum: Date;
  kunde: string;
  routeLabel?: string;
  positionen: { menge: number; bezeichnung: string; kind?: "TEXTIL" | "VEREDELUNG" | "SONSTIGE" }[];
  absender?: string[];
}

/** Laufzettel / Produktionszettel — interner Werkbeleg, OHNE Preise; Positionsart
 *  (Textil/Veredelung) je Zeile vorangestellt. */
export function laufzettelDokument(input: LaufzettelInput): BelegDokument {
  const tag = (k?: string): string => (k === "VEREDELUNG" ? "[Veredelung] " : k === "SONSTIGE" ? "[Sonstiges] " : "[Textil] ");
  return {
    typ: "LAUFZETTEL",
    titel: "Laufzettel / Produktionszettel",
    nummer: input.nummer,
    datum: formatDatum(input.datum),
    absender: input.absender && input.absender.length > 0 ? input.absender : [...ABSENDER_TEXMA],
    empfaenger: [`Kunde: ${input.kunde}`, ...(input.routeLabel ? [`Route: ${input.routeLabel}`] : [])],
    positionen: input.positionen.map((p) => ({ menge: p.menge, bezeichnung: `${tag(p.kind)}${p.bezeichnung}` })),
    summen: [],
    hinweise: ["Interner Produktionsbeleg — Veredelung erst nach Druckfreigabe des Kunden.", "Qualitätskontrolle mit Bilddokumentation vor Kommissionierung."],
    zeigePreise: false,
  };
}

export interface RechnungInput {
  nummer: string;
  datum: Date;
  empfaenger: string[];
  positionen: PreisPosition[];
  netCents: Cents;
  taxCents: Cents;
  grossCents: Cents;
  hinweise?: string[];
  /** Briefkopf (Admin-Portal); Default: ABSENDER_TEXMA. */
  absender?: string[];
}

/** Preis-Position für Rechnung/Angebot/AB. einzelpreisCents = effektiver Netto NACH Rabatt. */
export interface PreisPosition {
  menge: number;
  bezeichnung: string;
  einzelpreisCents: Cents;
  /** VK-Listenpreis je Stück VOR Rabatt (Anzeige in der Einzel-Spalte, wenn Rabatt gewährt). */
  listenpreisCents?: Cents | null;
  /** Positionsrabatt in Prozent (0..100); nur gesetzt, wenn gewährt. */
  rabattPct?: number | null;
}

/**
 * Redaktion der Bezugsquelle für KUNDENseitige Belege (Angebot/AB/Rechnung/Lieferschein):
 * der Kunde darf NICHT sehen, ob eine Veredelung intern/extern/inhouse erfolgt oder über welchen
 * Veredler (Fremdvergabe). Entfernt Klammerzusätze mit internem Bezug komplett (inkl. Veredler-
 * name darin) und neutralisiert verbliebene Einzelwörter. Interne Belege (Laufzettel/
 * Veredelungsauftrag) bleiben unberührt.
 */
const INTERN_RE = /\b(extern|intern|inhouse|fremdvergabe|lohnveredelung|veredler)\b/i;
export function redactKundenbezeichnung(text: string): string {
  return text
    // Klammerzusatz mit internem Bezug (z. B. „(extern hi5)") ganz entfernen.
    .replace(/\s*\([^)]*\)/g, (m) => (INTERN_RE.test(m) ? "" : m))
    // Verbliebene Einzelwörter entfernen.
    .replace(new RegExp(INTERN_RE.source, "gi"), "")
    // Aufräumen: doppelte Leerzeichen, Leerzeichen vor Satzzeichen, hängende Trenner.
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[\s,;:–-]+$/u, "")
    .trim();
}

/** Gemeinsame Preis-Positionen (Einzel-/Rabatt-/Zeilenpreis) für Rechnung/Angebot/AB. */
function preisPositionen(ps: PreisPosition[]): BelegPosition[] {
  return ps.map((p) => ({
    menge: p.menge,
    bezeichnung: redactKundenbezeichnung(p.bezeichnung),
    // Einzelpreis = VK-Liste (vor Rabatt), sonst der effektive Netto; Zeilenbetrag = effektiver Netto × Menge.
    einzelpreis: formatEur(p.listenpreisCents ?? p.einzelpreisCents),
    ...(p.rabattPct ? { rabatt: `${p.rabattPct} %` } : {}),
    gesamt: formatEur(lineNet(p.menge, p.einzelpreisCents)),
  }));
}

/** Netto/USt/Brutto-Summenblock. */
function preisSummen(netCents: Cents, taxCents: Cents, grossCents: Cents): BelegSumme[] {
  return [
    { label: "Netto", value: formatEur(netCents) },
    { label: "USt", value: formatEur(taxCents) },
    { label: "Brutto", value: formatEur(grossCents) },
  ];
}

function briefkopf(absender?: string[]): string[] {
  return absender && absender.length > 0 ? absender : [...ABSENDER_TEXMA];
}

/** Rechnung — mit Einzel-/Zeilenpreisen und Netto/USt/Brutto-Summen. */
export function rechnungDokument(input: RechnungInput): BelegDokument {
  return {
    typ: "RECHNUNG",
    titel: "Rechnung",
    nummer: input.nummer,
    datum: formatDatum(input.datum),
    absender: briefkopf(input.absender),
    empfaenger: input.empfaenger,
    positionen: preisPositionen(input.positionen),
    summen: preisSummen(input.netCents, input.taxCents, input.grossCents),
    hinweise: input.hinweise ?? ["Zahlbar ohne Abzug gemäß vereinbartem Zahlungsziel."],
    zeigePreise: true,
  };
}

export interface AngebotInput {
  nummer: string;
  datum: Date;
  empfaenger: string[];
  positionen: PreisPosition[];
  netCents: Cents;
  taxCents: Cents;
  grossCents: Cents;
  /** Bindefrist „gültig bis" (Kap. 35.1). */
  gueltigBis?: Date;
  hinweise?: string[];
  absender?: string[];
}

/** Angebot — mit Preisen, Bindefrist und AGB-Hinweis. */
export function angebotDokument(input: AngebotInput): BelegDokument {
  return {
    typ: "ANGEBOT",
    titel: "Angebot",
    nummer: input.nummer,
    datum: formatDatum(input.datum),
    absender: briefkopf(input.absender),
    empfaenger: input.empfaenger,
    positionen: preisPositionen(input.positionen),
    summen: preisSummen(input.netCents, input.taxCents, input.grossCents),
    hinweise: input.hinweise ?? [
      ...(input.gueltigBis ? [`Dieses Angebot ist gültig bis ${formatDatum(input.gueltigBis)}.`] : []),
      "Freibleibendes Angebot. Es gelten unsere Allgemeinen Geschäftsbedingungen.",
    ],
    zeigePreise: true,
  };
}

export interface AuftragsbestaetigungInput {
  nummer: string;
  datum: Date;
  empfaenger: string[];
  positionen: PreisPosition[];
  netCents: Cents;
  taxCents: Cents;
  grossCents: Cents;
  /** Zugesagter Liefertermin (B9). */
  liefertermin?: Date;
  /** Referenz auf die Kundenbestellung (z. B. Shop-Bestellnummer). */
  bestellreferenz?: string;
  hinweise?: string[];
  absender?: string[];
}

/** Auftragsbestätigung — bestätigte Positionen/Preise, Liefertermin, Bestellbezug. */
export function auftragsbestaetigungDokument(input: AuftragsbestaetigungInput): BelegDokument {
  return {
    typ: "AUFTRAGSBESTAETIGUNG",
    titel: "Auftragsbestätigung",
    nummer: input.nummer,
    datum: formatDatum(input.datum),
    absender: briefkopf(input.absender),
    empfaenger: input.empfaenger,
    positionen: preisPositionen(input.positionen),
    summen: preisSummen(input.netCents, input.taxCents, input.grossCents),
    hinweise: input.hinweise ?? [
      ...(input.bestellreferenz ? [`Bezug: Ihre Bestellung ${input.bestellreferenz}.`] : []),
      ...(input.liefertermin ? [`Zugesagter Liefertermin: ${formatDatum(input.liefertermin)}.`] : []),
      "Wir bestätigen Ihren Auftrag zu den genannten Konditionen.",
    ],
    zeigePreise: true,
  };
}

export interface GutschriftInput {
  nummer: string;
  datum: Date;
  empfaenger: string[];
  /** Ursprungsrechnung, die per Gutschrift neutralisiert wird. */
  rechnungNummer: string;
  grund: string;
  /** Gutgeschriebener Bruttobetrag (positiv). */
  amountCents: Cents;
  absender?: string[];
}

/** Gutschrift/Storno — neutralisiert eine Rechnung (GoBD: Original bleibt erhalten). */
export function gutschriftDokument(input: GutschriftInput): BelegDokument {
  return {
    typ: "GUTSCHRIFT",
    titel: "Gutschrift / Storno",
    nummer: input.nummer,
    datum: formatDatum(input.datum),
    absender: briefkopf(input.absender),
    empfaenger: input.empfaenger,
    positionen: [{
      menge: 1,
      bezeichnung: `Gutschrift zu Rechnung ${input.rechnungNummer}${input.grund ? ` — ${input.grund}` : ""}`,
      einzelpreis: formatEur(input.amountCents),
      gesamt: formatEur(input.amountCents),
    }],
    summen: [{ label: "Gutschriftbetrag (brutto)", value: formatEur(input.amountCents) }],
    hinweise: ["Storno per Gutschrift (GoBD): die ursprüngliche Rechnung bleibt unverändert erhalten."],
    zeigePreise: true,
  };
}

export interface MahnungInput {
  nummer: string;
  datum: Date;
  empfaenger: string[];
  /** Angemahnte Rechnung. */
  rechnungNummer: string;
  /** Mahnstufe (1..3). */
  stufe: number;
  /** Offener Betrag (brutto) + optionale Mahngebühr. */
  offenCents: Cents;
  mahngebuehrCents?: Cents;
  faelligSeit?: Date;
  zahlbarBis?: Date;
  absender?: string[];
}

const MAHN_TITEL: Record<number, string> = { 1: "Zahlungserinnerung", 2: "1. Mahnung", 3: "2. Mahnung" };

/** Mahnung — angemahnte Rechnung, Stufe, offener Betrag + ggf. Mahngebühr. */
export function mahnungDokument(input: MahnungInput): BelegDokument {
  const gebuehr = input.mahngebuehrCents ?? 0;
  const positionen: BelegPosition[] = [
    { menge: 1, bezeichnung: `Offener Betrag Rechnung ${input.rechnungNummer}`, einzelpreis: formatEur(input.offenCents), gesamt: formatEur(input.offenCents) },
    ...(gebuehr > 0 ? [{ menge: 1, bezeichnung: "Mahngebühr", einzelpreis: formatEur(gebuehr), gesamt: formatEur(gebuehr) }] : []),
  ];
  return {
    typ: "MAHNUNG",
    titel: MAHN_TITEL[input.stufe] ?? `Mahnung (Stufe ${input.stufe})`,
    nummer: input.nummer,
    datum: formatDatum(input.datum),
    absender: briefkopf(input.absender),
    empfaenger: input.empfaenger,
    positionen,
    summen: [{ label: "Zu zahlen (brutto)", value: formatEur(input.offenCents + gebuehr) }],
    hinweise: [
      ...(input.faelligSeit ? [`Fällig seit ${formatDatum(input.faelligSeit)}.`] : []),
      ...(input.zahlbarBis ? [`Wir bitten um Ausgleich bis ${formatDatum(input.zahlbarBis)}.`] : ["Wir bitten um umgehenden Ausgleich."]),
    ],
    zeigePreise: true,
  };
}
