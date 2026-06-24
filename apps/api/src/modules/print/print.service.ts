// Druckerzeugnisse: erzeugt Lieferschein- und Rechnungs-PDFs aus den persistierten
// Belegen. Die Datenform wird vom Repository geliefert; das reine Inhaltsmodell baut
// @texma/shared, gerendert wird mit pdf-lib (beleg-pdf). Rückgabe = Dateiname + Base64.

import { angebotDokument, auftragsbestaetigungDokument, laufzettelDokument, lieferscheinDokument, rechnungDokument, type PositionKind } from "@texma/shared";
import { renderBelegPdf } from "../../pdf/beleg-pdf.js";

export interface PricePrintLine { menge: number; bezeichnung: string; einzelpreisCents: number; listenpreisCents?: number | null; rabattPct?: number | null }

export interface DeliveryNotePrintData {
  number: string;
  createdAt: Date;
  empfaenger: string[];
  positionen: { menge: number; bezeichnung: string }[];
}

export interface InvoicePrintData {
  number: string;
  issuedAt: Date;
  empfaenger: string[];
  positionen: PricePrintLine[];
  netCents: number;
  taxCents: number;
  grossCents: number;
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
}

export interface PrintRepository {
  deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null>;
  invoiceForPrint(id: string): Promise<InvoicePrintData | null>;
  laufzettelForPrint(orderId: string): Promise<LaufzettelPrintData | null>;
  quoteForPrint(id: string): Promise<QuotePrintData | null>;
  orderConfirmationForPrint(orderId: string): Promise<OrderConfirmationPrintData | null>;
  /** Konfigurierter Briefkopf (Admin-Portal); leer = Renderer-Default. */
  briefkopf(): Promise<string[]>;
}

export interface PdfResult {
  filename: string;
  base64: string;
}

export class PrintError extends Error {}

export class PrintService {
  constructor(private readonly repo: PrintRepository) {}

  async deliveryNotePdf(id: string): Promise<PdfResult> {
    const d = await this.repo.deliveryNoteForPrint(id);
    if (!d) throw new PrintError(`Lieferschein ${id} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderBelegPdf(lieferscheinDokument({
      nummer: d.number, datum: d.createdAt, empfaenger: d.empfaenger, positionen: d.positionen, absender,
    }));
    return { filename: `Lieferschein-${d.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
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
    const absender = await this.repo.briefkopf();
    const bytes = await renderBelegPdf(rechnungDokument({
      nummer: i.number, datum: i.issuedAt, empfaenger: i.empfaenger, positionen: i.positionen,
      netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents, absender,
    }));
    return { filename: `Rechnung-${i.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Angebots-PDF (mit Preisen, Bindefrist). */
  async quotePdf(id: string): Promise<PdfResult> {
    const q = await this.repo.quoteForPrint(id);
    if (!q) throw new PrintError(`Angebot ${id} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderBelegPdf(angebotDokument({
      nummer: q.number, datum: q.datum, empfaenger: q.empfaenger, positionen: q.positionen,
      netCents: q.netCents, taxCents: q.taxCents, grossCents: q.grossCents,
      gueltigBis: q.gueltigBis ?? undefined, absender,
    }));
    return { filename: `Angebot-${q.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  /** Auftragsbestätigungs-PDF (bestätigte Positionen, Liefertermin, Bestellbezug). */
  async auftragsbestaetigungPdf(orderId: string): Promise<PdfResult> {
    const o = await this.repo.orderConfirmationForPrint(orderId);
    if (!o) throw new PrintError(`Auftrag ${orderId} nicht gefunden.`);
    const absender = await this.repo.briefkopf();
    const bytes = await renderBelegPdf(auftragsbestaetigungDokument({
      nummer: o.number, datum: o.datum, empfaenger: o.empfaenger, positionen: o.positionen,
      netCents: o.netCents, taxCents: o.taxCents, grossCents: o.grossCents,
      liefertermin: o.liefertermin ?? undefined, bestellreferenz: o.bestellreferenz ?? undefined, absender,
    }));
    return { filename: `Auftragsbestaetigung-${o.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }
}
