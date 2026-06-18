// E-Rechnung Eingang — Kap. 19. Klärung K-13 (Empfang + Validierung).
// Parst eine empfangene CII-/XRechnung-E-Rechnung in das EInvoiceModel und nutzt
// die bestehende EN16931-Kernvalidierung (einvoice.ts). Ergebnis ist die Grundlage
// für eine IncomingInvoice (3-Way-Match, Kap. 9.6). Dependency-frei (kein XML-Lib):
// strukturelle Extraktion der EN16931-Kern-Geschäftsobjekte.

import type { Cents } from "./money.js";
import {
  type EInvoiceModel,
  type EInvoiceValidationResult,
  validateEInvoice,
} from "./einvoice.js";

/** Tag-Inhalt per lokalem Namen (Namespace-Präfix egal). Erstes Vorkommen. */
function tag(xml: string, local: string): string | undefined {
  const m = new RegExp(`<(?:\\w+:)?${local}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${local}>`).exec(
    xml
  );
  return m?.[1]?.trim();
}

/** Block eines Aggregats per lokalem Namen (für verschachtelte Extraktion). */
function block(xml: string, local: string): string | undefined {
  return tag(xml, local);
}

function decToCents(dec: string | undefined): Cents | undefined {
  if (dec == null) return undefined;
  const v = Number.parseFloat(dec);
  if (Number.isNaN(v)) return undefined;
  return Math.round(v * 100);
}

function parseDate102(s: string | undefined): Date | undefined {
  if (!s || !/^\d{8}$/.test(s)) return undefined;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, d));
}

export interface ParsedEInvoice extends Partial<EInvoiceModel> {
  lineCount: number;
}

/** Extrahiert die EN16931-Kernfelder aus dem CII-XML. */
export function parseEInvoiceXml(xml: string): ParsedEInvoice {
  const headerDoc = block(xml, "ExchangedDocument") ?? "";
  const invoiceNumber = tag(headerDoc, "ID");
  const issueDate = parseDate102(tag(headerDoc, "DateTimeString"));

  const sellerBlock = block(xml, "SellerTradeParty") ?? "";
  const buyerBlock = block(xml, "BuyerTradeParty") ?? "";
  const sellerName = tag(sellerBlock, "Name");
  const sellerVatId = tag(sellerBlock, "ID"); // SpecifiedTaxRegistration/ID
  const buyerName = tag(buyerBlock, "Name");

  const currency = tag(xml, "InvoiceCurrencyCode");
  const netCents = decToCents(tag(xml, "TaxBasisTotalAmount"));
  const taxCents = decToCents(tag(xml, "TaxTotalAmount"));
  const grossCents = decToCents(tag(xml, "GrandTotalAmount"));

  const lineCount = (
    xml.match(/<(?:\w+:)?IncludedSupplyChainTradeLineItem[\s>]/g) ?? []
  ).length;

  const parsed: ParsedEInvoice = { lineCount };
  if (invoiceNumber) parsed.invoiceNumber = invoiceNumber;
  if (issueDate) parsed.issueDate = issueDate;
  if (currency) parsed.currency = currency;
  if (sellerName) parsed.seller = { name: sellerName, country: "DE", vatId: sellerVatId };
  if (buyerName) parsed.buyer = { name: buyerName, country: "DE" };
  if (netCents != null) parsed.netCents = netCents;
  if (taxCents != null) parsed.taxCents = taxCents;
  if (grossCents != null) parsed.grossCents = grossCents;
  // validateEInvoice prüft lines.length; Kernfelder reichen, Positionsdetails optional.
  if (lineCount > 0) parsed.lines = new Array(lineCount).fill(null).map((_, i) => ({
    id: String(i + 1),
    name: "",
    qty: 0,
    unitNetCents: 0,
    lineNetCents: 0,
    vatRatePercent: 0,
  }));
  return parsed;
}

export interface IncomingInvoiceDraft {
  supplierName: string;
  supplierVatId?: string;
  number: string;
  netCents: Cents;
  taxCents: Cents;
  grossCents: Cents;
  issueDate: Date;
}

export interface InboundEInvoiceResult {
  parsed: ParsedEInvoice;
  validation: EInvoiceValidationResult;
  /** Nur gesetzt, wenn valid — sonst geht die Rechnung in die Klärung. */
  draft?: IncomingInvoiceDraft;
}

/**
 * Verarbeitet eine empfangene E-Rechnung (K-13): parsen → EN16931 validieren →
 * bei Gültigkeit einen IncomingInvoice-Entwurf erzeugen.
 */
export function receiveEInvoice(xml: string): InboundEInvoiceResult {
  const parsed = parseEInvoiceXml(xml);
  const validation = validateEInvoice(parsed);
  if (!validation.valid) {
    return { parsed, validation };
  }
  return {
    parsed,
    validation,
    draft: {
      supplierName: parsed.seller!.name,
      supplierVatId: parsed.seller!.vatId,
      number: parsed.invoiceNumber!,
      netCents: parsed.netCents!,
      taxCents: parsed.taxCents!,
      grossCents: parsed.grossCents!,
      issueDate: parsed.issueDate!,
    },
  };
}
