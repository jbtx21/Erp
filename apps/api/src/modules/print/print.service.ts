// Druckerzeugnisse: erzeugt Lieferschein- und Rechnungs-PDFs aus den persistierten
// Belegen. Die Datenform wird vom Repository geliefert; das reine Inhaltsmodell baut
// @texma/shared, gerendert wird mit pdf-lib (beleg-pdf). Rückgabe = Dateiname + Base64.

import { angebotDokument, auftragsbestaetigungDokument, gutschriftDokument, kundenStammblatt, laufzettelDokument, lieferantenStammblatt, lieferscheinDokument, mahnungDokument, rechnungDokument, veredelungsauftragDokument, type BelegAnsprechpartner, type BelegMetaZeile, type FirmenProfil, type KundenStammblattInput, type LieferantenStammblattInput, type PositionKind, type VeredelungMotivLine, type VeredelungTextilLine } from "@texma/shared";
import { renderBelegPdf } from "../../pdf/beleg-pdf.js";
import { renderVeredelungsauftragPdf } from "../../pdf/veredelungsauftrag-pdf.js";
import { TEXMA_LOGO_B64 } from "../../pdf/texma-logo.js";
import { renderDataSheetPdf } from "../../pdf/datasheet-pdf.js";

export interface PricePrintLine { menge: number; bezeichnung: string; einzelpreisCents: number; listenpreisCents?: number | null; rabattPct?: number | null; artNr?: string; detail?: string[]; alternativ?: boolean }

/** Brief-Kopf-Metadaten (TEXMA-Layout): Kunden-Nr., Ansprechpartner, Zusatz-Meta-Zeilen, Anrede. */
export interface LetterMeta {
  kundenNr?: string;
  ansprechpartner?: BelegAnsprechpartner;
  metaExtra?: BelegMetaZeile[];
  anrede?: string;
}

export interface DeliveryNotePrintData {
  number: string;
  createdAt: Date;
  empfaenger: string[];
  positionen: { menge: number; bezeichnung: string; artNr?: string; detail?: string[] }[];
  meta?: LetterMeta;
}

export interface InvoicePrintData {
  number: string;
  issuedAt: Date;
  empfaenger: string[];
  positionen: PricePrintLine[];
  netCents: number;
  taxCents: number;
  grossCents: number;
  meta?: LetterMeta;
}

export interface LaufzettelPrintData {
  number: string;
  createdAt: Date;
  kunde: string;
  routeLabel: string | null;
  positionen: { menge: number; bezeichnung: string; kind: PositionKind }[];
}

export interface QuotePrintData {
  number: string;
  datum: Date;
  empfaenger: string[];
  positionen: PricePrintLine[];
  netCents: number;
  taxCents: number;
  grossCents: number;
  gueltigBis: Date | null;
  meta?: LetterMeta;
}

export interface OrderConfirmationPrintData {
  number: string;
  datum: Date;
  empfaenger: string[];
  positionen: PricePrintLine[];
  netCents: number;
  taxCents: number;
  grossCents: number;
  liefertermin: Date | null;
  bestellreferenz: string | null;
  meta?: LetterMeta;
}

export interface CreditNotePrintData {
  number: string;
  createdAt: Date;
  empfaenger: string[];
  rechnungNummer: string;
  grund: string;
  amountCents: number;
}

export interface MahnungPrintData {
  nummer: string;
  erstelltAm: Date;
  empfaenger: string[];
  rechnungNummer: string;
  stufe: number;
  offenCents: number;
  mahngebuehrCents: number;
  faelligSeit: Date;
}

/** Veredelungsauftrag-Daten (Werkstattblatt) für eine Fremdvergabe-/Inhouse-Stufe. */
export interface VeredelungsauftragPrintData {
  nummer: string;
  datum: Date;
  /** Veredler-Name; null = Inhouse-Veredelung. */
  veredler: string | null;
  kunde: string;
  kommission: string | null;
  textilien: VeredelungTextilLine[];
  motive: VeredelungMotivLine[];
  anlieferung: Date | null;
  fertigstellung: Date | null;
  hinweise?: string[];
}

/** Kunden-Stammdaten fürs Datenblatt (alle Felder außer Datum/Absender — die ergänzt der Service). */
export type CompanyDataSheetData = Omit<KundenStammblattInput, "datum" | "absender">;
/** Lieferanten-Stammdaten fürs Datenblatt. */
export type SupplierDataSheetData = Omit<LieferantenStammblattInput, "datum" | "absender">;

/** Kunden-Belegtypen mit eigenem PDF (Mailversand/Outlook-Entwurf). */
export type BelegMailKind = "QUOTE" | "AUFTRAGSBESTAETIGUNG" | "INVOICE" | "LIEFERSCHEIN" | "GUTSCHRIFT" | "MAHNUNG" | "LEIHGUT";

export interface PrintRepository {
  deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null>;
  /** E-Mail des Belegempfängers (Firma) für den Outlook-Entwurf; null = keine hinterlegt. */
  recipientEmailForBeleg(kind: BelegMailKind, id: string): Promise<string | null>;
  /** Kunden-Stammdaten fürs Stammdatenblatt; null, wenn unbekannt. */
  companyForDataSheet(companyId: string): Promise<CompanyDataSheetData | null>;
  /** Lieferanten-Stammdaten fürs Stammdatenblatt; null, wenn unbekannt. */
  supplierForDataSheet(supplierId: string): Promise<SupplierDataSheetData | null>;
  /** Gutschrift/Storno-Beleg für den PDF-Druck. */
  creditNoteForPrint(id: string): Promise<CreditNotePrintData | null>;
  /** Mahnbeleg (DunningNotice) für den PDF-Druck. */
  mahnungForPrint(id: string): Promise<MahnungPrintData | null>;
  /** Muster-Leihgut als Lieferschein-Daten (Empfänger + Positionen, ohne Preise). */
  sampleLoanForPrint(loanId: string): Promise<DeliveryNotePrintData | null>;
  invoiceForPrint(id: string): Promise<InvoicePrintData | null>;
  laufzettelForPrint(orderId: string): Promise<LaufzettelPrintData | null>;
  quoteForPrint(id: string): Promise<QuotePrintData | null>;
  orderConfirmationForPrint(orderId: string): Promise<OrderConfirmationPrintData | null>;
  /** Veredelungsauftrag (Werkstattblatt) einer Fremdvergabe-/Inhouse-Stufe; null, wenn unbekannt. */
  veredelungsauftragForPrint(subProductionId: string): Promise<VeredelungsauftragPrintData | null>;
  /** Konfigurierter Briefkopf (Admin-Portal); leer = Renderer-Default. */
  briefkopf(): Promise<string[]>;
  /** Firmenprofil (Belegkopf/-fuß) aus den Einstellungen. */
  companyProfile(): Promise<FirmenProfil>;
  /** Firmenlogo (JPEG base64) aus den Einstellungen; null = gebündelter Default. */
  companyLogo(): Promise<string | null>;
}

export interface PdfResult {
  filename: string;
  base64: string;
}

export class PrintError extends Error {}

export class PrintService {
  constructor(private readonly repo: PrintRepository) {}

  /** TEXMA-Briefkopf-Felder (Firma/Logo + Kunden-Nr./Ansprechpartner/Anrede) zentral laden. */
  private async briefFelder(number: string, meta: LetterMeta | undefined, anredeFallback = "Sehr geehrte Damen und Herren,"): Promise<{
    firma: FirmenProfil; logoB64: string; kommissionsNr: string; kundenNr?: string;
    ansprechpartner?: BelegAnsprechpartner; metaExtra?: BelegMetaZeile[]; anrede: string;
  }> {
    const [firma, logo] = await Promise.all([this.repo.companyProfile(), this.repo.companyLogo()]);
    return {
      firma, logoB64: logo ?? TEXMA_LOGO_B64, kommissionsNr: number,
      ...(meta?.kundenNr ? { kundenNr: meta.kundenNr } : {}),
      ...(meta?.ansprechpartner ? { ansprechpartner: meta.ansprechpartner } : {}),
      ...(meta?.metaExtra ? { metaExtra: meta.metaExtra } : {}),
      anrede: meta?.anrede ?? anredeFallback,
    };
  }

  /** E-Mail des Belegempfängers (Firma) für den Outlook-Entwurf; null = keine hinterlegt. */
  recipientEmailForBeleg(kind: BelegMailKind, id: string): Promise<string | null> {
    return this.repo.recipientEmailForBeleg(kind, id);
  }

  async deliveryNotePdf(id: string): Promise<PdfResult> {
    const d = await this.repo.deliveryNoteForPrint(id);
    if (!d) throw new PrintError(`Lieferschein ${id} nicht gefunden.`);
    const brief = await this.briefFelder(d.number, d.meta);
    const bytes = await renderBelegPdf(lieferscheinDokument({
      nummer: d.number, datum: d.createdAt, empfaenger: d.empfaenger, positionen: d.positionen,
      ...brief, einleitung: "anbei erhalten Sie die nachstehend aufgeführte Ware:",
    }));
    return { filename: `Lieferschein-${d.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Lieferschein für eine Muster-Leihe (Leihgut, ohne Preise). */
  async sampleLoanLieferscheinPdf(loanId: string): Promise<PdfResult> {
    const d = await this.repo.sampleLoanForPrint(loanId);
    if (!d) throw new PrintError(`Muster-Leihe ${loanId} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderBelegPdf(lieferscheinDokument({
      nummer: d.number, datum: d.createdAt, empfaenger: d.empfaenger, positionen: d.positionen, absender,
      hinweise: ["Muster-Leihgut — Rückgabe innerhalb 21 Tagen, sonst Musterrechnung zum Listenpreis (B5)."],
    }));
    return { filename: `Leihgut-Lieferschein-${d.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Laufzettel/Produktionszettel zum Auftrag (Workflow-Schritt LAUFZETTEL). */
  async laufzettelPdf(orderId: string): Promise<PdfResult> {
    const o = await this.repo.laufzettelForPrint(orderId);
    if (!o) throw new PrintError(`Auftrag ${orderId} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderBelegPdf(laufzettelDokument({
      nummer: o.number, datum: o.createdAt, kunde: o.kunde, routeLabel: o.routeLabel ?? undefined, positionen: o.positionen, absender,
    }));
    return { filename: `Laufzettel-${o.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  async invoicePdf(id: string): Promise<PdfResult> {
    const i = await this.repo.invoiceForPrint(id);
    if (!i) throw new PrintError(`Rechnung ${id} nicht gefunden.`);
    const brief = await this.briefFelder(i.number, i.meta);
    const bytes = await renderBelegPdf(rechnungDokument({
      nummer: i.number, datum: i.issuedAt, empfaenger: i.empfaenger, positionen: i.positionen,
      netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents,
      ...brief, einleitung: "für die Ausführung Ihres Auftrages berechnen wir Ihnen die nachstehenden Leistungen:",
    }));
    return { filename: `Rechnung-${i.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Gutschrift-/Storno-PDF (neutralisiert eine Rechnung, GoBD). */
  async creditNotePdf(id: string): Promise<PdfResult> {
    const c = await this.repo.creditNoteForPrint(id);
    if (!c) throw new PrintError(`Gutschrift ${id} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderBelegPdf(gutschriftDokument({
      nummer: c.number, datum: c.createdAt, empfaenger: c.empfaenger,
      rechnungNummer: c.rechnungNummer, grund: c.grund, amountCents: c.amountCents, absender,
    }));
    return { filename: `Gutschrift-${c.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Mahnungs-PDF (Stufe, offener Betrag, Mahngebühr). */
  async mahnungPdf(id: string): Promise<PdfResult> {
    const m = await this.repo.mahnungForPrint(id);
    if (!m) throw new PrintError(`Mahnung ${id} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderBelegPdf(mahnungDokument({
      nummer: m.nummer, datum: m.erstelltAm, empfaenger: m.empfaenger, rechnungNummer: m.rechnungNummer,
      stufe: m.stufe, offenCents: m.offenCents, mahngebuehrCents: m.mahngebuehrCents, faelligSeit: m.faelligSeit, absender,
    }));
    return { filename: `Mahnung-${m.nummer}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Angebots-PDF (mit Preisen, Bindefrist). */
  async quotePdf(id: string): Promise<PdfResult> {
    const q = await this.repo.quoteForPrint(id);
    if (!q) throw new PrintError(`Angebot ${id} nicht gefunden.`);
    const brief = await this.briefFelder(q.number, q.meta);
    const bytes = await renderBelegPdf(angebotDokument({
      nummer: q.number, datum: q.datum, empfaenger: q.empfaenger, positionen: q.positionen,
      netCents: q.netCents, taxCents: q.taxCents, grossCents: q.grossCents,
      gueltigBis: q.gueltigBis ?? undefined,
      ...brief, einleitung: "herzlichen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:",
    }));
    return { filename: `Angebot-${q.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Auftragsbestätigungs-PDF (bestätigte Positionen, Liefertermin, Bestellbezug). */
  async auftragsbestaetigungPdf(orderId: string): Promise<PdfResult> {
    const o = await this.repo.orderConfirmationForPrint(orderId);
    if (!o) throw new PrintError(`Auftrag ${orderId} nicht gefunden.`);
    const brief = await this.briefFelder(o.number, o.meta);
    const bytes = await renderBelegPdf(auftragsbestaetigungDokument({
      nummer: o.number, datum: o.datum, empfaenger: o.empfaenger, positionen: o.positionen,
      netCents: o.netCents, taxCents: o.taxCents, grossCents: o.grossCents,
      liefertermin: o.liefertermin ?? undefined, bestellreferenz: o.bestellreferenz ?? undefined,
      ...brief, einleitung: "wir danken für Ihre Bestellung und bestätigen Ihnen diese wie folgt:",
    }));
    return { filename: `Auftragsbestaetigung-${o.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Veredelungsauftrag-PDF (Werkstattblatt mit Größen-Matrix + Veredelungspositionen). */
  async veredelungsauftragPdf(subProductionId: string): Promise<PdfResult> {
    const v = await this.repo.veredelungsauftragForPrint(subProductionId);
    if (!v) throw new PrintError(`Veredelungsauftrag ${subProductionId} nicht gefunden.`);
    const [firma, logo] = await Promise.all([this.repo.companyProfile(), this.repo.companyLogo()]);
    const bytes = await renderVeredelungsauftragPdf(veredelungsauftragDokument({
      nummer: v.nummer, datum: v.datum, veredler: v.veredler, kunde: v.kunde,
      kommission: v.kommission ?? undefined, textilien: v.textilien, motive: v.motive,
      anlieferung: v.anlieferung, fertigstellung: v.fertigstellung, hinweise: v.hinweise,
      firma, logoB64: logo ?? TEXMA_LOGO_B64,
    }));
    return { filename: `Veredelungsauftrag-${v.nummer}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Kunden-Stammdatenblatt (internes Datenblatt, kein Beleg). */
  async customerDataSheetPdf(companyId: string): Promise<PdfResult> {
    const c = await this.repo.companyForDataSheet(companyId);
    if (!c) throw new PrintError(`Kunde ${companyId} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderDataSheetPdf(kundenStammblatt({ ...c, datum: new Date(), absender }));
    const slug = (c.customerNumber ?? c.name).replace(/[^\w.-]+/g, "_");
    return { filename: `Kundenstammblatt-${slug}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Lieferanten-Stammdatenblatt (internes Datenblatt). */
  async supplierDataSheetPdf(supplierId: string): Promise<PdfResult> {
    const s = await this.repo.supplierForDataSheet(supplierId);
    if (!s) throw new PrintError(`Lieferant ${supplierId} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderDataSheetPdf(lieferantenStammblatt({ ...s, datum: new Date(), absender }));
    const slug = s.name.replace(/[^\w.-]+/g, "_");
    return { filename: `Lieferantenstammblatt-${slug}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }
}
