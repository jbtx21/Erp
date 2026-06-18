// E-Rechnung — Kap. 19. Erzeugung (XRechnung/ZUGFeRD, CII-Profil) + Eingangs-
// validierung. Pflicht seit 01.01.2025 (Empfang); Versand-Mandat folgt 2027/2028.
// Hinweis: pragmatisches EN16931-Kernprofil (Cross Industry Invoice / Factur-X).
// Beträge in Cent intern, im XML als Dezimal mit Punkt (EN16931-Konvention).

import type { Cents } from "./money.js";

export interface EInvoiceParty {
  name: string;
  /** USt-IdNr. (BT-31/BT-48). */
  vatId?: string;
  country: string; // ISO 3166-1, z. B. "DE"
}

export interface EInvoiceLine {
  id: string;
  name: string;
  qty: number;
  unitNetCents: Cents;
  lineNetCents: Cents;
  vatRatePercent: number; // z. B. 19
}

export interface EInvoiceModel {
  invoiceNumber: string; // BT-1
  issueDate: Date; // BT-2
  currency: string; // BT-5, z. B. "EUR"
  seller: EInvoiceParty;
  buyer: EInvoiceParty;
  lines: EInvoiceLine[];
  netCents: Cents; // BT-106
  taxCents: Cents; // BT-110
  grossCents: Cents; // BT-112
}

function dec(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

function isoDate(d: Date): string {
  // EN16931 Format 102: YYYYMMDD
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Erzeugt eine E-Rechnung im CII-Kernprofil (ZUGFeRD/Factur-X bzw. XRechnung-CII).
 * Bewusst auf die EN16931-Kern-Geschäftsobjekte beschränkt; das XML ist die
 * Grundlage für die PDF/A-3-Einbettung (ZUGFeRD) bzw. den XRechnung-Versand.
 */
export function buildEInvoiceXml(m: EInvoiceModel): string {
  const lines = m.lines
    .map(
      (l) => `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${esc(l.id)}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.name)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${dec(l.unitNetCents)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${l.qty}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${l.vatRatePercent}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${dec(l.lineNetCents)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument>
    <ram:ID>${esc(m.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${isoDate(m.issueDate)}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>${esc(m.seller.name)}</ram:Name>${m.seller.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(m.seller.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}</ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${esc(m.buyer.name)}</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${esc(m.currency)}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>${dec(m.netCents)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${esc(m.currency)}">${dec(m.taxCents)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${dec(m.grossCents)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${dec(m.grossCents)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

export interface EInvoiceValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Eingangsvalidierung (Kap. 19): prüft die Pflicht-Geschäftsobjekte einer
 * empfangenen E-Rechnung. Bewusst strukturell (kein Schematron) — fängt die
 * häufigsten Fehler ab, bevor eine Rechnung in die Verarbeitung geht.
 */
export function validateEInvoice(m: Partial<EInvoiceModel>): EInvoiceValidationResult {
  const errors: string[] = [];
  if (!m.invoiceNumber) errors.push("BT-1 Rechnungsnummer fehlt");
  if (!m.issueDate) errors.push("BT-2 Rechnungsdatum fehlt");
  if (!m.currency) errors.push("BT-5 Währung fehlt");
  if (!m.seller?.name) errors.push("BG-4 Verkäufer fehlt");
  if (!m.seller?.vatId) errors.push("BT-31 USt-IdNr. Verkäufer fehlt");
  if (!m.buyer?.name) errors.push("BG-7 Käufer fehlt");
  if (!m.lines || m.lines.length === 0) errors.push("BG-25 keine Rechnungsposition");
  if (m.netCents != null && m.taxCents != null && m.grossCents != null) {
    if (m.netCents + m.taxCents !== m.grossCents) {
      errors.push("BR-CO-15 Brutto ≠ Netto + Steuer");
    }
  } else {
    errors.push("BT-106/110/112 Summen unvollständig");
  }
  return { valid: errors.length === 0, errors };
}
