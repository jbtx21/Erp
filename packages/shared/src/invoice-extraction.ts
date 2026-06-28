// Beleg-Extraktion Eingangsrechnung (GetMyInvoices-Vorbild, Kap. 9.4): EIN kanonisches
// Datenmodell für die ausgelesenen Rechnungsdaten — egal ob aus E-/X-Rechnung (strukturiert)
// oder aus OCR/Texterkennung (PDF/Scan). Der Heuristik-Parser unten liest eingefügten/erkannten
// Rechnungstext (Lieferant, USt-IdNr., Nummer, Datum, Summen + Positionen) und ist damit das
// testbare Substitut für die OCR-Engine; eine echte Vision-/Cloud-OCR liefert dieselbe Form.

import { parseEuroInput, type Cents } from "./money.js";

export interface ExtractedInvoiceLine {
  description: string;
  /** Lieferanten-Artikelnummer (für die Auflösung auf die interne Variante); optional. */
  supplierSku?: string;
  qty: number;
  /** EK je Stück (netto, Cent). */
  unitNetCents: Cents;
}

export interface ExtractedInvoice {
  supplierName: string;
  supplierVatId?: string;
  number: string;
  issueDate: Date;
  netCents: Cents;
  taxCents: Cents;
  grossCents: Cents;
  lines: ExtractedInvoiceLine[];
}

const FIELD_PATTERNS: Record<string, RegExp> = {
  supplierName: /^(?:lieferant|verk[äa]ufer|firma|von)\s*[:\-]\s*(.+)$/i,
  supplierVatId: /^(?:ust[\-\s]?id(?:nr)?\.?|umsatzsteuer[\-\s]?id|vat)\s*[:\-]\s*(.+)$/i,
  number: /^(?:rechnungs?[\-\s]?(?:nummer|nr)\.?|beleg(?:nr)?\.?|invoice)\s*[:\-]\s*(.+)$/i,
  issueDate: /^(?:rechnungs?datum|datum|date)\s*[:\-]\s*(.+)$/i,
  netCents: /^(?:netto|nettobetrag|zwischensumme)\s*[:\-]\s*(.+)$/i,
  taxCents: /^(?:ust|mwst|umsatzsteuer|steuer|tax)\s*[:\-]\s*(.+)$/i,
  grossCents: /^(?:brutto|bruttobetrag|gesamt(?:betrag)?|rechnungsbetrag|total)\s*[:\-]\s*(.+)$/i,
};

// Position: "10 x Garnrolle schwarz @ 10,00 [SKU-123]" / "2 × Knopf @ 1,50".
const LINE_PATTERN = /^(?:position\s*[:\-]\s*)?(\d+(?:[.,]\d+)?)\s*[x×]\s*(.+?)\s*@\s*([\d.,]+)\s*(?:€|eur)?\s*(?:\[(.+?)\])?\s*$/i;

function parseDateLoose(raw: string): Date | null {
  const s = raw.trim();
  // ISO YYYY-MM-DD
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // DD.MM.YYYY
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return null;
}

/**
 * Liest erkannten/eingefügten Rechnungstext in die kanonische Form. Liefert null, wenn die
 * Pflichtfelder (Lieferant, Nummer, Datum, Bruttobetrag) nicht erkennbar sind → Klärung statt
 * Phantom-Beleg. Fehlt Netto/USt, werden sie aus Brutto + Positionen bzw. 0 abgeleitet.
 */
export function parseInvoiceText(text: string): ExtractedInvoice | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fields: Record<string, string> = {};
  const items: ExtractedInvoiceLine[] = [];

  for (const line of lines) {
    const item = LINE_PATTERN.exec(line);
    if (item) {
      const qty = parseEuroInput(item[1]!) ?? 0; // tolerant gegen "1,0"
      const unit = parseEuroInput(item[3]!);
      if (qty > 0 && unit != null) {
        items.push({ qty: Math.round(qty), description: item[2]!.trim(), unitNetCents: Math.round(unit * 100), ...(item[4] ? { supplierSku: item[4].trim() } : {}) });
      }
      continue;
    }
    for (const [key, re] of Object.entries(FIELD_PATTERNS)) {
      if (fields[key] != null) continue;
      const m = re.exec(line);
      if (m) { fields[key] = m[1]!.trim(); break; }
    }
  }

  const issueDate = fields.issueDate ? parseDateLoose(fields.issueDate) : null;
  const grossEur = fields.grossCents != null ? parseEuroInput(fields.grossCents) : null;
  if (!fields.supplierName || !fields.number || !issueDate || grossEur == null) return null;

  const grossCents = Math.round(grossEur * 100);
  const netEur = fields.netCents != null ? parseEuroInput(fields.netCents) : null;
  const taxEur = fields.taxCents != null ? parseEuroInput(fields.taxCents) : null;
  const netCents = netEur != null ? Math.round(netEur * 100) : taxEur != null ? grossCents - Math.round(taxEur * 100) : grossCents;
  const taxCents = taxEur != null ? Math.round(taxEur * 100) : grossCents - netCents;

  return {
    supplierName: fields.supplierName,
    ...(fields.supplierVatId ? { supplierVatId: fields.supplierVatId } : {}),
    number: fields.number,
    issueDate,
    netCents,
    taxCents,
    grossCents,
    lines: items,
  };
}
