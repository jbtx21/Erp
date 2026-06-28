// Default-Belegvorlagen für den E-Mail-Versand / Outlook-Entwurf (ERP-Grundfunktion / G-5).
// Bisher waren Betreff/Text der Kunden-Belegmails im Backend hartkodiert und auf der
// Vorlagen-Seite (#emailtemplates) NICHT pflegbar. Diese Datei ist die EINE Quelle der
// Default-Texte: die Vorlagen-Seite listet sie (überschreibbar), und der Mailversand
// (mail.sendBeleg / mail.buildDraft) rendert die gepflegte bzw. die Default-Vorlage über
// renderTemplate(). Rein und IO-frei (testbar ohne DB).

/** Belegtypen mit eigenem PDF, die als Kundenmail versendbar sind (deckungsgleich mit
 *  BelegMailKind im API-Print-Modul). */
export type BelegMailKind =
  | "QUOTE"
  | "AUFTRAGSBESTAETIGUNG"
  | "INVOICE"
  | "LIEFERSCHEIN"
  | "GUTSCHRIFT"
  | "MAHNUNG"
  | "LEIHGUT";

export interface BelegTemplateDefault {
  kind: BelegMailKind;
  /** Vorlagenschlüssel in der EmailTemplate-Tabelle, z. B. „beleg.quote". */
  key: string;
  /** Lesbarer Belegname (UI-Label). */
  label: string;
  /** Default-Betreff mit Platzhalter {{ belegnr }}. */
  subject: string;
  /** Default-Text mit Platzhalter {{ belegnr }}. */
  body: string;
}

const SIGNATUR = "Mit freundlichen Grüßen\nTEXMA Textilmarketing GmbH";
const anschreiben = (satz: string): string =>
  `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie ${satz} als PDF.\n\n${SIGNATUR}`;

/** Default-Vorlagen je Belegtyp (Reihenfolge = Anzeigereihenfolge auf der Vorlagen-Seite). */
export const BELEG_MAIL_TEMPLATES: readonly BelegTemplateDefault[] = [
  { kind: "QUOTE", key: "beleg.quote", label: "Angebot", subject: "Angebot {{ belegnr }}", body: anschreiben("unser Angebot") },
  { kind: "AUFTRAGSBESTAETIGUNG", key: "beleg.auftragsbestaetigung", label: "Auftragsbestätigung", subject: "Auftragsbestätigung {{ belegnr }}", body: anschreiben("unsere Auftragsbestätigung") },
  { kind: "INVOICE", key: "beleg.invoice", label: "Rechnung", subject: "Rechnung {{ belegnr }}", body: anschreiben("Ihre Rechnung") },
  { kind: "LIEFERSCHEIN", key: "beleg.lieferschein", label: "Lieferschein", subject: "Lieferschein {{ belegnr }}", body: anschreiben("Ihren Lieferschein") },
  { kind: "GUTSCHRIFT", key: "beleg.gutschrift", label: "Gutschrift", subject: "Gutschrift {{ belegnr }}", body: anschreiben("Ihre Gutschrift") },
  { kind: "MAHNUNG", key: "beleg.mahnung", label: "Mahnung", subject: "Mahnung {{ belegnr }}", body: anschreiben("unsere Zahlungserinnerung") },
  { kind: "LEIHGUT", key: "beleg.leihgut", label: "Leihgut-Lieferschein", subject: "Leihgut-Lieferschein {{ belegnr }}", body: anschreiben("den Lieferschein zum Muster-Leihgut") },
] as const;

const BY_KIND = new Map<BelegMailKind, BelegTemplateDefault>(BELEG_MAIL_TEMPLATES.map((t) => [t.kind, t]));

/** Vorlagenschlüssel für einen Belegtyp (z. B. „beleg.invoice"). */
export function belegTemplateKey(kind: BelegMailKind): string {
  return BY_KIND.get(kind)!.key;
}

/** Default-Vorlage für einen Belegtyp (Fallback, wenn keine gepflegte Vorlage existiert). */
export function belegTemplateByKind(kind: BelegMailKind): BelegTemplateDefault {
  return BY_KIND.get(kind)!;
}

/** Bekannt? — true, wenn der Schlüssel zu einer Belegvorlage gehört. */
export function isBelegTemplateKey(key: string): boolean {
  return BELEG_MAIL_TEMPLATES.some((t) => t.key === key);
}
