// Auftragsampel (Xentral-Vorbild: Auftragsübersicht-Statusampel). Pro Auftrag eine
// Reihe von Prüf-Lampen, die auf einen Blick zeigen, ob der Auftrag versandbereit ist
// bzw. was ihn blockiert. TEXMA-Teilmenge der Xentral-Checks (Porto/Nachnahme/Adress-
// validierung/Kreditlimit sind hier nicht abgebildet). Reine, IO-freie Logik (Kap. 35.4).

import type { OrderStatus } from "./order.js";
import type { FulfillmentStatus } from "./fulfillment.js";

/** Lampe einer Einzelprüfung. GRAU = nicht zutreffend/neutral (zählt nicht für Gesamt). */
export type AmpelLamp = "GRUEN" | "GELB" | "ROT" | "GRAU";

export type ProduktionState = "KEINE" | "ANGELEGT" | "FREIGEGEBEN" | "ABGESCHLOSSEN";

export interface AmpelCheck {
  key: string;
  label: string;
  lamp: AmpelLamp;
  hint: string;
}

export interface AuftragsampelInput {
  status: OrderStatus;
  today: Date;
  liefertermin: Date | null;
  lieferstatus: FulfillmentStatus;
  fakturastatus: FulfillmentStatus;
  /** Forderung der Auftragsrechnung: null = noch nicht fakturiert. */
  openCents: number | null;
  grossCents: number | null;
  /** Bestandsdeckung je variantengebundener Position (true = verfügbar ≥ Menge). */
  lines: ReadonlyArray<{ hasVariant: boolean; sufficient: boolean }>;
  /** EU-Auslands-B2B (USt-IdNr. nötig) + ob die hinterlegte USt-IdNr. gültig ist. */
  isEuForeignB2B: boolean;
  vatIdValid: boolean;
  /** Produktionsstand (Modul Produktion); KEINE = kein Produktionsauftrag. */
  produktion: ProduktionState;
  /** Auftrag zur Produktion/Versand freigegeben (Freigabe-Gate K-10). */
  freigegeben: boolean;
  /** Liefersperre des Kunden (z. B. Mahnsperre) — blockiert die Auslieferung. */
  liefersperre: boolean;
}

export interface AuftragsampelRow {
  checks: AmpelCheck[];
  /** Gesamtlampe: ROT, falls eine Prüfung ROT; sonst GELB bei einer GELB; sonst GRÜN. */
  overall: AmpelLamp;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Informativ (treibt die Gesamtampel nicht): nur Storno (ROT) und Abschluss (GRÜN)
// sind wertend, laufende Zustände bleiben neutral (GRAU) — sonst wäre jeder offene
// Auftrag dauerhaft GELB.
function bearbeitung(status: OrderStatus): AmpelCheck {
  if (status === "STORNIERT") return { key: "bearbeitung", label: "Bearbeitung", lamp: "ROT", hint: "Auftrag wurde storniert" };
  if (status === "ABGESCHLOSSEN") return { key: "bearbeitung", label: "Bearbeitung", lamp: "GRUEN", hint: "Alle Schritte abgeschlossen" };
  return { key: "bearbeitung", label: "Bearbeitung", lamp: "GRAU", hint: `Status: ${status}` };
}

function bestand(lines: AuftragsampelInput["lines"]): AmpelCheck {
  const relevant = lines.filter((l) => l.hasVariant);
  if (relevant.length === 0) return { key: "bestand", label: "Lagerbestand", lamp: "GRAU", hint: "Keine bestandsgeführten Positionen" };
  const short = relevant.filter((l) => !l.sufficient).length;
  return short > 0
    ? { key: "bestand", label: "Lagerbestand", lamp: "ROT", hint: `Für ${short} Position(en) kein ausreichender Bestand` }
    : { key: "bestand", label: "Lagerbestand", lamp: "GRUEN", hint: "Ausreichender Bestand vorhanden" };
}

function ustId(input: AuftragsampelInput): AmpelCheck {
  if (!input.isEuForeignB2B) return { key: "ustid", label: "USt-IdNr.", lamp: "GRAU", hint: "Nicht erforderlich (Inland/Privat)" };
  return input.vatIdValid
    ? { key: "ustid", label: "USt-IdNr.", lamp: "GRUEN", hint: "USt-IdNr.-Prüfung erfolgreich" }
    : { key: "ustid", label: "USt-IdNr.", lamp: "ROT", hint: "USt-IdNr. fehlt oder ungültig (EU-Ausland B2B)" };
}

function liefertermin(input: AuftragsampelInput): AmpelCheck {
  if (input.lieferstatus === "VOLL") return { key: "liefertermin", label: "Liefertermin", lamp: "GRUEN", hint: "Vollständig geliefert" };
  if (!input.liefertermin) return { key: "liefertermin", label: "Liefertermin", lamp: "GRAU", hint: "Kein Liefertermin hinterlegt" };
  const days = Math.floor((input.liefertermin.getTime() - input.today.getTime()) / DAY_MS);
  if (days < 0) return { key: "liefertermin", label: "Liefertermin", lamp: "ROT", hint: `Liefertermin um ${-days} Tag(e) überfällig` };
  if (days <= 2) return { key: "liefertermin", label: "Liefertermin", lamp: "GELB", hint: `Liefertermin in ${days} Tag(en)` };
  return { key: "liefertermin", label: "Liefertermin", lamp: "GRUEN", hint: "Liefertermin in der Zukunft" };
}

function lieferung(lieferstatus: FulfillmentStatus): AmpelCheck {
  if (lieferstatus === "VOLL") return { key: "lieferung", label: "Lieferung", lamp: "GRUEN", hint: "Vollständig geliefert" };
  if (lieferstatus === "TEILWEISE") return { key: "lieferung", label: "Lieferung", lamp: "GELB", hint: "Teillieferung erfolgt" };
  return { key: "lieferung", label: "Lieferung", lamp: "GRAU", hint: "Noch nicht geliefert" };
}

function zahlung(input: AuftragsampelInput): AmpelCheck {
  if (input.openCents === null || input.grossCents === null) return { key: "zahlung", label: "Zahlung", lamp: "GRAU", hint: "Noch nicht fakturiert" };
  if (input.openCents <= 0) return { key: "zahlung", label: "Zahlung", lamp: "GRUEN", hint: "Vollständig bezahlt" };
  if (input.openCents < input.grossCents) return { key: "zahlung", label: "Zahlung", lamp: "GELB", hint: "Teilzahlung vorhanden" };
  return { key: "zahlung", label: "Zahlung", lamp: "ROT", hint: "Offen (keine Zahlung eingegangen)" };
}

function faktura(fakturastatus: FulfillmentStatus): AmpelCheck {
  if (fakturastatus === "VOLL") return { key: "faktura", label: "Faktura", lamp: "GRUEN", hint: "Vollständig fakturiert" };
  if (fakturastatus === "TEILWEISE") return { key: "faktura", label: "Faktura", lamp: "GELB", hint: "Teilfaktura" };
  return { key: "faktura", label: "Faktura", lamp: "GRAU", hint: "Noch nicht fakturiert" };
}

function produktion(state: ProduktionState): AmpelCheck {
  switch (state) {
    case "KEINE": return { key: "produktion", label: "Produktion", lamp: "GRAU", hint: "Keine Produktion vorhanden" };
    case "ANGELEGT": return { key: "produktion", label: "Produktion", lamp: "GELB", hint: "Produktion angelegt (nicht freigegeben)" };
    case "FREIGEGEBEN": return { key: "produktion", label: "Produktion", lamp: "GELB", hint: "Produktion freigegeben/läuft" };
    case "ABGESCHLOSSEN": return { key: "produktion", label: "Produktion", lamp: "GRUEN", hint: "Produktion abgeschlossen" };
  }
}

function freigabe(input: AuftragsampelInput): AmpelCheck {
  return input.freigegeben
    ? { key: "freigabe", label: "Freigabe", lamp: "GRUEN", hint: "Zur Produktion/Versand freigegeben" }
    : { key: "freigabe", label: "Freigabe", lamp: "GELB", hint: "Freigabe ausstehend" };
}

function liefersperre(input: AuftragsampelInput): AmpelCheck {
  return input.liefersperre
    ? { key: "liefersperre", label: "Liefersperre", lamp: "ROT", hint: "Liefersperre aktiv (z. B. Mahnsperre)" }
    : { key: "liefersperre", label: "Liefersperre", lamp: "GRUEN", hint: "Keine Liefersperre" };
}

/** Berechnet die Auftragsampel (Prüf-Lampen + Gesamtlampe) eines Auftrags. */
export function computeAuftragsampel(input: AuftragsampelInput): AuftragsampelRow {
  const checks = [
    bearbeitung(input.status),
    bestand(input.lines),
    ustId(input),
    liefertermin(input),
    lieferung(input.lieferstatus),
    faktura(input.fakturastatus),
    zahlung(input),
    produktion(input.produktion),
    freigabe(input),
    liefersperre(input),
  ];
  // Storno → Gesamt ROT (Auftrag gegenstandslos).
  if (input.status === "STORNIERT") return { checks, overall: "ROT" };
  const overall: AmpelLamp = checks.some((c) => c.lamp === "ROT") ? "ROT" : checks.some((c) => c.lamp === "GELB") ? "GELB" : "GRUEN";
  return { checks, overall };
}
