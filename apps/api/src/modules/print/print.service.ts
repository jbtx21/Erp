// Druckerzeugnisse: erzeugt Lieferschein- und Rechnungs-PDFs aus den persistierten
// Belegen. Die Datenform wird vom Repository geliefert; das reine Inhaltsmodell baut
// @texma/shared, gerendert wird mit pdf-lib (beleg-pdf). Rückgabe = Dateiname + Base64.

import { laufzettelDokument, lieferscheinDokument, rechnungDokument, type PositionKind } from "@texma/shared";
import { renderBelegPdf } from "../../pdf/beleg-pdf.js";

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
  positionen: { menge: number; bezeichnung: string; einzelpreisCents: number }[];
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

export interface PrintRepository {
  deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null>;
  invoiceForPrint(id: string): Promise<InvoicePrintData | null>;
  laufzettelForPrint(orderId: string): Promise<LaufzettelPrintData | null>;
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
}
