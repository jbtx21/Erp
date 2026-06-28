// Ausgangs-E-Rechnung (XRechnung/ZUGFeRD-CII, Kap. 19): erzeugt aus einer persistierten
// Ausgangsrechnung das EN16931-Kern-XML (buildEInvoiceXml, @texma/shared) und validiert es
// (validateEInvoice, Stufe 1) vor der Ausgabe. Verkäufer (Seller) + USt-Satz stammen aus den
// Einstellungen; Käufer (Buyer) + Positionen aus der Rechnung. Reine Mapping-Logik über das
// Repository-Interface (testbar ohne DB); gültige XML wird am Beleg gespeichert (eInvoiceXml).

import {
  buildEInvoiceXml,
  validateEInvoice,
  type EInvoiceLine,
  type EInvoiceModel,
  type EInvoiceParty,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

/** Rohe Rechnungsposition (wie in Faktura/Druck): Netto-Einzelpreis nach Rabatt + Listenpreis. */
export interface EInvoiceLineInput {
  description: string;
  qty: number;
  unitNetCents: number; // BT-146 (nach Rabatt)
  listNetCents: number | null; // BT-148 (Listenpreis vor Rabatt)
  rabattPct: number | null;
}

export interface EInvoiceData {
  number: string;
  issuedAt: Date;
  netCents: number;
  taxCents: number;
  grossCents: number;
  currency: string;
  buyer: EInvoiceParty;
  lines: EInvoiceLineInput[];
}

export interface EInvoiceRepository {
  /** Lädt die EN16931-Kerndaten einer Ausgangsrechnung (Käufer + Positionen); null = unbekannt. */
  invoiceForEInvoice(invoiceId: string): Promise<EInvoiceData | null>;
  /** Speichert die erzeugte E-Rechnung am Beleg (GoBD-Nachweis des Versandformats). */
  persistXml(invoiceId: string, xml: string): Promise<void>;
}

/** Optionen aus den Einstellungen: Verkäuferangaben + zentraler USt-Satz. */
export interface EInvoiceOptions {
  seller: EInvoiceParty;
  taxRatePercent: number;
}

export interface EInvoiceResult {
  filename: string;
  xml: string;
  valid: boolean;
  errors: string[];
}

export class EInvoiceError extends Error {}

export class EInvoiceService {
  constructor(private readonly repo: EInvoiceRepository, private readonly audit: AuditSink) {}

  /**
   * Baut die Ausgangs-E-Rechnung (XRechnung-CII) zu einer Rechnung. Die Positions-Netto-
   * summe und Brutto = Netto + Steuer werden von der EN16931-Validierung (Stufe 1) geprüft;
   * nur gültige XML wird am Beleg gespeichert. Ungültige wird mit Gründen zurückgegeben.
   */
  async buildForInvoice(invoiceId: string, opts: EInvoiceOptions): Promise<EInvoiceResult> {
    const inv = await this.repo.invoiceForEInvoice(invoiceId);
    if (!inv) throw new EInvoiceError(`Rechnung ${invoiceId} nicht gefunden.`);

    const lines: EInvoiceLine[] = inv.lines.map((l, i) => {
      const line: EInvoiceLine = {
        id: String(i + 1),
        name: l.description,
        qty: l.qty,
        unitNetCents: l.unitNetCents,
        lineNetCents: l.qty * l.unitNetCents,
        vatRatePercent: opts.taxRatePercent,
      };
      // Positionsrabatt ausweisen (BT-148/147/139), wenn ein höherer Listenpreis hinterlegt ist.
      if (l.listNetCents != null && l.listNetCents > l.unitNetCents) {
        line.grossUnitNetCents = l.listNetCents;
        line.discountReason = l.rabattPct ? `Positionsrabatt ${l.rabattPct} %` : "Positionsrabatt";
      }
      return line;
    });

    const model: EInvoiceModel = {
      invoiceNumber: inv.number,
      issueDate: inv.issuedAt,
      currency: inv.currency || "EUR",
      seller: opts.seller,
      buyer: inv.buyer,
      lines,
      netCents: inv.netCents,
      taxCents: inv.taxCents,
      grossCents: inv.grossCents,
    };

    const validation = validateEInvoice(model);
    const xml = buildEInvoiceXml(model);
    const filename = `XRechnung-${inv.number}.xml`;

    if (validation.valid) {
      await this.repo.persistXml(invoiceId, xml);
      await this.audit.append(buildEntry({
        entity: "Invoice", entityId: invoiceId, action: "EXPORT",
        after: { format: "XRechnung-CII", number: inv.number, bytes: xml.length },
      }));
    }

    return { filename, xml, valid: validation.valid, errors: validation.errors };
  }
}
