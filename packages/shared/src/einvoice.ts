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
  unitNetCents: Cents; // Netto-Einzelpreis NACH Rabatt (BT-146)
  lineNetCents: Cents; // Zeilenbetrag = unitNetCents × qty (BT-131)
  vatRatePercent: number; // z. B. 19
  /** VK-Listenpreis je Stück VOR Rabatt (BT-148); gesetzt → Positionsrabatt wird ausgewiesen. */
  grossUnitNetCents?: Cents;
  /** Grund/Bezeichnung des Positionsrabatts (BT-139), z. B. "Positionsrabatt 10 %". */
  discountReason?: string;
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
  // Preisblock je Position: bei Positionsrabatt Brutto-Listenpreis (BT-148) + Abschlag
  // (AppliedTradeAllowanceCharge, BT-147/139) zusätzlich zum Netto-Einzelpreis (BT-146).
  const agreement = (l: EInvoiceLine): string => {
    if (l.grossUnitNetCents != null && l.grossUnitNetCents > l.unitNetCents) {
      const allowance = l.grossUnitNetCents - l.unitNetCents;
      return `<ram:SpecifiedLineTradeAgreement><ram:GrossPriceProductTradePrice><ram:ChargeAmount>${dec(l.grossUnitNetCents)}</ram:ChargeAmount><ram:AppliedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${dec(allowance)}</ram:ActualAmount>${l.discountReason ? `<ram:Reason>${esc(l.discountReason)}</ram:Reason>` : ""}</ram:AppliedTradeAllowanceCharge></ram:GrossPriceProductTradePrice><ram:NetPriceProductTradePrice><ram:ChargeAmount>${dec(l.unitNetCents)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`;
    }
    return `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${dec(l.unitNetCents)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`;
  };
  const lines = m.lines
    .map(
      (l) => `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${esc(l.id)}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.name)}</ram:Name></ram:SpecifiedTradeProduct>
      ${agreement(l)}
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

  // Positions-Pflichtangaben + Summenkonsistenz (EN16931-Geschäftsregeln, Stufe 1).
  if (m.lines && m.lines.length > 0) {
    m.lines.forEach((l, i) => {
      const n = i + 1;
      if (!l.id) errors.push(`BR-21 Positions-ID fehlt (Zeile ${n})`);
      if (!l.name) errors.push(`BR-25 Artikelname fehlt (Zeile ${n})`);
      if (!(l.qty > 0)) errors.push(`BT-129 Menge fehlt/≤0 (Zeile ${n})`);
      if (l.vatRatePercent == null) errors.push(`BR-CO-4 USt-Satz der Position fehlt (Zeile ${n})`);
      // Positionsrabatt: Brutto-Listenpreis (BT-148) darf nicht unter dem Netto-Preis (BT-146) liegen.
      if (l.grossUnitNetCents != null && l.grossUnitNetCents < l.unitNetCents) {
        errors.push(`BT-148 Brutto-Einzelpreis < Netto-Einzelpreis (Zeile ${n})`);
      }
    });
    if (m.netCents != null) {
      const lineSum = m.lines.reduce((s, l) => s + (l.lineNetCents ?? 0), 0);
      if (lineSum !== m.netCents) {
        errors.push("BR-CO-10 Σ Positionsnetto ≠ Rechnungsnetto (BT-106)");
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zweistufige EN16931-Validierung (F3). Stufe 1 ist TS-nativ und Pflicht (schnell,
// JVM-frei). Stufe 2 = KoSIT-Schematron, optional als Sidecar injiziert — bleibt
// damit aus dem Normalbetrieb heraus und wird nur bei Zertifizierungsbedarf genutzt.
// ─────────────────────────────────────────────────────────────────────────────

/** Optionaler Stufe-2-Validator (z. B. KoSIT-Schematron im Worker-Sidecar). */
export type SchematronValidator = (xml: string) => Promise<EInvoiceValidationResult>;

export interface TwoStageInput {
  model: Partial<EInvoiceModel>;
  /** Roh-XML für die Schematron-Prüfung (Stufe 2). */
  xml?: string;
  /** Stufe-2-Validator; fehlt er, bleibt es bei der TS-nativen Stufe 1. */
  schematron?: SchematronValidator;
}

export interface TwoStageResult extends EInvoiceValidationResult {
  stage1: EInvoiceValidationResult;
  /** `null` = Stufe 2 nicht ausgeführt (kein Validator/XML, oder Stufe 1 schon rot). */
  stage2: EInvoiceValidationResult | null;
}

/**
 * Führt Stufe 1 (immer) und Stufe 2 (nur wenn Validator + XML vorhanden UND Stufe 1
 * sauber) aus — kein teurer Sidecar-Aufruf für offensichtlich kaputte Belege.
 */
export async function validateEInvoiceTwoStage(
  input: TwoStageInput
): Promise<TwoStageResult> {
  const stage1 = validateEInvoice(input.model);
  let stage2: EInvoiceValidationResult | null = null;
  if (stage1.valid && input.schematron && input.xml != null) {
    stage2 = await input.schematron(input.xml);
  }
  const valid = stage1.valid && (stage2 === null || stage2.valid);
  const errors = [...stage1.errors, ...(stage2?.errors ?? [])];
  return { valid, errors, stage1, stage2 };
}
