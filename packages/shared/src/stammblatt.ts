// Stammdatenblatt (Kunde/Lieferant): reines Inhaltsmodell + Builder. IO-frei und
// testbar — das PDF-Rendering liegt in apps/api (datasheet-pdf). Beträge in Cent rein,
// formatierte Strings raus. Anders als ein Beleg trägt das Datenblatt keine Positionen,
// sondern thematisch gruppierte Felder (Sektionen).

import { formatEur, type Cents } from "./money.js";
import { ABSENDER_TEXMA } from "./beleg.js";

export interface StammblattFeld {
  label: string;
  wert: string;
}

export interface StammblattSektion {
  titel: string;
  felder: StammblattFeld[];
}

export interface StammblattDokument {
  titel: string;
  /** Sprechende Nummer (KD-…/LF-…); null, wenn (noch) keine vergeben. */
  nummer: string | null;
  datum: string;
  name: string;
  absender: string[];
  sektionen: StammblattSektion[];
  hinweise: string[];
}

function formatDatum(d: Date): string {
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Adresszeile aus Straße/PLZ/Ort/Land; leere Teile entfallen. */
function adresse(a: { street: string | null; zip: string | null; city: string | null; country: string | null }): string {
  const ort = [a.zip, a.city].filter(Boolean).join(" ");
  return [a.street, ort, a.country && a.country !== "DE" ? a.country : null].filter(Boolean).join(", ") || "—";
}

const TAX_RULE_LABEL: Record<string, string> = {
  INLAND: "Inland", EU_B2B: "EU (innergem. B2B, §13b)", DRITTLAND: "Drittland (Ausfuhr)", KLEINUNTERNEHMER: "Kleinunternehmer §19",
};

/** Nur Sektionen mit mindestens einem nicht-leeren Feld behalten (kompaktes Blatt). */
function compact(sektionen: StammblattSektion[]): StammblattSektion[] {
  return sektionen
    .map((s) => ({ titel: s.titel, felder: s.felder.filter((f) => f.wert && f.wert !== "—") }))
    .filter((s) => s.felder.length > 0);
}

export interface KundenStammblattInput {
  name: string;
  customerNumber: string | null;
  priceGroupKind: string;
  branche: string | null;
  street: string | null; zip: string | null; city: string | null; country: string | null;
  vatId: string | null; taxNumber: string | null; taxRule: string | null;
  iban: string | null; bic: string | null; bankName: string | null;
  sepaMandateRef: string | null; sepaMandateDate: string | null;
  zahlungszielTage: number; skontoPercent: number | null; skontoDays: number | null;
  paymentMethod: string | null; kreditlimitCents: Cents | null;
  liefersperre: boolean; liefersperreGrund: string | null;
  debitorenkonto: string | null; belegsprache: string | null; waehrung: string | null; betreuer: string | null;
  datum: Date;
  absender?: string[];
}

export function kundenStammblatt(input: KundenStammblattInput): StammblattDokument {
  const skonto = input.skontoPercent != null ? `${input.skontoPercent} % / ${input.skontoDays ?? "?"} Tage` : "—";
  return {
    titel: "Kundenstammblatt",
    nummer: input.customerNumber,
    datum: formatDatum(input.datum),
    name: input.name,
    absender: input.absender && input.absender.length > 0 ? input.absender : [...ABSENDER_TEXMA],
    sektionen: compact([
      { titel: "Allgemein", felder: [
        { label: "Name", wert: input.name },
        { label: "Kunden-Nr.", wert: input.customerNumber ?? "—" },
        { label: "Branche", wert: input.branche ?? "—" },
        { label: "Preisgruppe", wert: input.priceGroupKind },
        { label: "Betreuer", wert: input.betreuer ?? "—" },
      ] },
      { titel: "Rechnungsadresse", felder: [
        { label: "Anschrift", wert: adresse(input) },
      ] },
      { titel: "Steuer", felder: [
        { label: "USt-IdNr.", wert: input.vatId ?? "—" },
        { label: "Steuernummer", wert: input.taxNumber ?? "—" },
        { label: "Steuerregel", wert: TAX_RULE_LABEL[input.taxRule ?? "INLAND"] ?? (input.taxRule ?? "—") },
      ] },
      { titel: "Bankverbindung", felder: [
        { label: "IBAN", wert: input.iban ?? "—" },
        { label: "BIC", wert: input.bic ?? "—" },
        { label: "Bank", wert: input.bankName ?? "—" },
        { label: "SEPA-Mandat", wert: input.sepaMandateRef ? `${input.sepaMandateRef}${input.sepaMandateDate ? ` · ${input.sepaMandateDate}` : ""}` : "—" },
      ] },
      { titel: "Konditionen", felder: [
        { label: "Zahlungsziel", wert: `${input.zahlungszielTage} Tage` },
        { label: "Skonto", wert: skonto },
        { label: "Zahlart", wert: input.paymentMethod ?? "—" },
        { label: "Kreditlimit", wert: input.kreditlimitCents != null ? formatEur(input.kreditlimitCents) : "—" },
        { label: "Belegsprache / Währung", wert: `${input.belegsprache ?? "DE"} / ${input.waehrung ?? "EUR"}` },
        { label: "Debitorenkonto", wert: input.debitorenkonto ?? "—" },
      ] },
      { titel: "Sperren", felder: [
        { label: "Liefersperre", wert: input.liefersperre ? `ja${input.liefersperreGrund ? ` (${input.liefersperreGrund})` : ""}` : "—" },
      ] },
    ]),
    hinweise: ["Stammdatenblatt — internes Dokument, kein steuerlicher Beleg."],
  };
}

export interface LieferantenStammblattInput {
  name: string;
  kind: string;
  street: string | null; zip: string | null; city: string | null; country: string | null;
  vatId: string | null; iban: string | null; bic: string | null;
  zahlungszielTage: number; skontoPercent: number | null; skontoDays: number | null;
  lieferzeitTage: number | null; notiz: string | null;
  itemCount: number;
  datum: Date;
  absender?: string[];
}

export function lieferantenStammblatt(input: LieferantenStammblattInput): StammblattDokument {
  const skonto = input.skontoPercent != null ? `${input.skontoPercent} % / ${input.skontoDays ?? "?"} Tage` : "—";
  return {
    titel: "Lieferantenstammblatt",
    nummer: null,
    datum: formatDatum(input.datum),
    name: input.name,
    absender: input.absender && input.absender.length > 0 ? input.absender : [...ABSENDER_TEXMA],
    sektionen: compact([
      { titel: "Allgemein", felder: [
        { label: "Name", wert: input.name },
        { label: "Connector", wert: input.kind },
        { label: "Katalog-Artikel", wert: String(input.itemCount) },
      ] },
      { titel: "Anschrift", felder: [
        { label: "Adresse", wert: adresse(input) },
      ] },
      { titel: "Steuer / Bank", felder: [
        { label: "USt-IdNr.", wert: input.vatId ?? "—" },
        { label: "IBAN", wert: input.iban ?? "—" },
        { label: "BIC", wert: input.bic ?? "—" },
      ] },
      { titel: "Konditionen", felder: [
        { label: "Zahlungsziel", wert: `${input.zahlungszielTage} Tage` },
        { label: "Skonto", wert: skonto },
        { label: "Lieferzeit", wert: input.lieferzeitTage != null ? `${input.lieferzeitTage} Tage` : "—" },
      ] },
      { titel: "Notiz", felder: [
        { label: "Vermerk", wert: input.notiz ?? "—" },
      ] },
    ]),
    hinweise: ["Stammdatenblatt — internes Dokument."],
  };
}
