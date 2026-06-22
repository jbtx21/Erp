// Druckerzeugnisse: erzeugt Lieferschein- und Rechnungs-PDFs aus den persistierten
// Belegen. Die Datenform wird vom Repository geliefert; das reine Inhaltsmodell baut
// @texma/shared, gerendert wird mit pdf-lib (beleg-pdf). Rückgabe = Dateiname + Base64.

import { lieferscheinDokument, rechnungDokument } from "@texma/shared";
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

export interface PrintRepository {
  deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null>;
  invoiceForPrint(id: string): Promise<InvoicePrintData | null>;
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
    const bytes = await renderBelegPdf(lieferscheinDokument({
      nummer: d.number, datum: d.createdAt, empfaenger: d.empfaenger, positionen: d.positionen,
    }));
    return { filename: `Lieferschein-${d.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }

  async invoicePdf(id: string): Promise<PdfResult> {
    const i = await this.repo.invoiceForPrint(id);
    if (!i) throw new PrintError(`Rechnung ${id} nicht gefunden.`);
    const bytes = await renderBelegPdf(rechnungDokument({
      nummer: i.number, datum: i.issuedAt, empfaenger: i.empfaenger, positionen: i.positionen,
      netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents,
    }));
    return { filename: `Rechnung-${i.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  }
}
