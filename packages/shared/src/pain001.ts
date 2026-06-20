// SEPA-Überweisung (PIS, Kap. 9): reiner Builder für pain.001.001.09
// (CustomerCreditTransferInitiation) inkl. IBAN-Prüfung (mod-97). Keine I/O — die
// Einreichung beim Bank-Provider (EBICS/PSD2) liegt in der API. Das XML ist das, was wir
// dem finAPI-/EBICS-Kanal übergeben bzw. was PSD2-PIS intern erzeugt.

export interface SepaCreditTransfer {
  creditorName: string;
  creditorIban: string;
  creditorBic?: string;
  amountCents: number;
  /** Verwendungszweck (unstrukturiert, ≤ 140 Zeichen). */
  remittance: string;
  /** Ende-zu-Ende-Referenz; Standard: aus MsgId + Position abgeleitet. */
  endToEndId?: string;
}

export interface SepaPaymentOrder {
  messageId: string;
  debtorName: string;
  debtorIban: string;
  debtorBic?: string;
  /** Gewünschtes Ausführungsdatum (YYYY-MM-DD). */
  requestedExecutionDate: string;
  transfers: SepaCreditTransfer[];
  /** Erstellzeitpunkt (Test-Injektion); Standard: jetzt. */
  createdAt?: Date;
}

/** XML-Sonderzeichen escapen. */
function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** Cent → SEPA-Betrag „12.34" (Punkt, 2 Nachkommastellen). */
function amount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Normalisiert eine IBAN (Leerzeichen weg, Großbuchstaben). */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/** IBAN-Prüfung per ISO 7064 mod-97 (Struktur + Prüfziffer). */
export function ibanIsValid(iban: string): boolean {
  const v = normalizeIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of code) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

/** Validiert einen Zahlungsauftrag (IBANs, Beträge, Pflichtfelder, Längen). */
export function validateSepaPaymentOrder(order: SepaPaymentOrder): void {
  if (!order.messageId?.trim()) throw new Error("MsgId (messageId) ist erforderlich.");
  if (!order.debtorName?.trim()) throw new Error("Auftraggebername ist erforderlich.");
  if (!ibanIsValid(order.debtorIban)) throw new Error("Auftraggeber-IBAN ist ungültig.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.requestedExecutionDate)) {
    throw new Error("Ausführungsdatum muss im Format YYYY-MM-DD vorliegen.");
  }
  if (!order.transfers.length) throw new Error("Mindestens eine Überweisung ist erforderlich.");
  for (const [i, t] of order.transfers.entries()) {
    const pos = `Überweisung ${i + 1}`;
    if (!t.creditorName?.trim()) throw new Error(`${pos}: Empfängername fehlt.`);
    if (!ibanIsValid(t.creditorIban)) throw new Error(`${pos}: Empfänger-IBAN ist ungültig.`);
    if (!Number.isInteger(t.amountCents) || t.amountCents <= 0) throw new Error(`${pos}: Betrag muss > 0 sein.`);
    if ((t.remittance ?? "").length > 140) throw new Error(`${pos}: Verwendungszweck max. 140 Zeichen.`);
  }
}

/** Summe aller Überweisungen in Cent (Kontrollsumme). */
export function paymentOrderTotalCents(order: SepaPaymentOrder): number {
  return order.transfers.reduce((s, t) => s + t.amountCents, 0);
}

function agent(bic?: string): string {
  return bic?.trim()
    ? `<FinInstnId><BICFI>${esc(bic.trim())}</BICFI></FinInstnId>`
    : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
}

/**
 * Erzeugt das pain.001.001.09-XML für einen validierten SEPA-Überweisungsauftrag.
 * NbOfTxs/CtrlSum werden aus den Überweisungen berechnet; SvcLvl=SEPA, ChrgBr=SLEV.
 */
export function buildPain001(order: SepaPaymentOrder): string {
  validateSepaPaymentOrder(order);
  const nb = order.transfers.length;
  const ctrl = amount(paymentOrderTotalCents(order));
  const creDtTm = (order.createdAt ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const tx = order.transfers
    .map((t, i) => {
      const e2e = esc(t.endToEndId ?? `${order.messageId}-${i + 1}`);
      const cdtrAgt = t.creditorBic?.trim() ? `<CdtrAgt>${agent(t.creditorBic)}</CdtrAgt>` : "";
      return (
        `<CdtTrfTxInf>` +
        `<PmtId><EndToEndId>${e2e}</EndToEndId></PmtId>` +
        `<Amt><InstdAmt Ccy="EUR">${amount(t.amountCents)}</InstdAmt></Amt>` +
        cdtrAgt +
        `<Cdtr><Nm>${esc(t.creditorName)}</Nm></Cdtr>` +
        `<CdtrAcct><Id><IBAN>${esc(normalizeIban(t.creditorIban))}</IBAN></Id></CdtrAcct>` +
        `<RmtInf><Ustrd>${esc(t.remittance ?? "")}</Ustrd></RmtInf>` +
        `</CdtTrfTxInf>`
      );
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">` +
    `<CstmrCdtTrfInitn>` +
    `<GrpHdr>` +
    `<MsgId>${esc(order.messageId)}</MsgId>` +
    `<CreDtTm>${creDtTm}</CreDtTm>` +
    `<NbOfTxs>${nb}</NbOfTxs>` +
    `<CtrlSum>${ctrl}</CtrlSum>` +
    `<InitgPty><Nm>${esc(order.debtorName)}</Nm></InitgPty>` +
    `</GrpHdr>` +
    `<PmtInf>` +
    `<PmtInfId>${esc(order.messageId)}</PmtInfId>` +
    `<PmtMtd>TRF</PmtMtd>` +
    `<BtchBookg>true</BtchBookg>` +
    `<NbOfTxs>${nb}</NbOfTxs>` +
    `<CtrlSum>${ctrl}</CtrlSum>` +
    `<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>` +
    `<ReqdExctnDt><Dt>${order.requestedExecutionDate}</Dt></ReqdExctnDt>` +
    `<Dbtr><Nm>${esc(order.debtorName)}</Nm></Dbtr>` +
    `<DbtrAcct><Id><IBAN>${esc(normalizeIban(order.debtorIban))}</IBAN></Id></DbtrAcct>` +
    `<DbtrAgt>${agent(order.debtorBic)}</DbtrAgt>` +
    `<ChrgBr>SLEV</ChrgBr>` +
    tx +
    `</PmtInf>` +
    `</CstmrCdtTrfInitn>` +
    `</Document>`
  );
}
