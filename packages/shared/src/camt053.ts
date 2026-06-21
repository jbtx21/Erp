// CAMT.053-Parser (ISO 20022 Bank-to-Customer-Statement) — Kap. 9.4, T-13.
// Extrahiert die Buchungseinträge (<Ntry>) eines Kontoauszugs in eine kanonische
// Form für den Banking-Abgleich (matchPayments). Dependency-frei (kein XML-Lib):
// namespace-agnostische, strukturelle Extraktion der relevanten Felder. FinTS/HBCI
// liefert dieselben CAMT.053-Daten — der Live-Abruf wäre ein späterer Connector.

import { eurToCents, type Cents } from "./money.js";

export type CreditDebit = "CRDT" | "DBIT";

export interface CamtTransaction {
  /** Stabiler Schlüssel der Bank-Transaktion (idempotenter Import). */
  externalRef: string;
  /** Verwendungszweck (enthält idealerweise die Rechnungsnummer). */
  reference: string;
  amountCents: Cents;
  creditDebit: CreditDebit;
  valueDate?: Date;
}

/** Inhalt des ersten Vorkommens eines Tags (lokaler Name, Präfix egal). */
function tag(xml: string, local: string): string | undefined {
  const m = new RegExp(`<(?:\\w+:)?${local}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${local}>`).exec(xml);
  return m?.[1]?.trim();
}

/** Alle Vorkommen eines Aggregat-Tags (z. B. jeder <Ntry>-Block). */
function blocks(xml: string, local: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${local}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${local}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] != null) out.push(m[1]);
  }
  return out;
}

function parseIsoDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined;
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parst die Buchungseinträge eines CAMT.053-Auszugs. Pro <Ntry>: Betrag (→ Cent),
 * Soll/Haben (CdtDbtInd), Bankreferenz (AcctSvcrRef, sonst EndToEndId, sonst aus
 * Datum+Betrag+Verwendungszweck zusammengesetzt) und Verwendungszweck (Ustrd).
 */
export function parseCamt053(xml: string): CamtTransaction[] {
  const out: CamtTransaction[] = [];
  for (const ntry of blocks(xml, "Ntry")) {
    const amountRaw = tag(ntry, "Amt");
    if (amountRaw == null) continue;
    const amountCents = eurToCents(amountRaw);
    const creditDebit: CreditDebit = tag(ntry, "CdtDbtInd") === "DBIT" ? "DBIT" : "CRDT";
    const valueDate = parseIsoDate(tag(tag(ntry, "ValDt") ?? "", "Dt"));
    const reference = tag(ntry, "Ustrd") ?? "";
    const externalRef =
      tag(ntry, "AcctSvcrRef") ??
      tag(ntry, "EndToEndId") ??
      `${valueDate?.toISOString().slice(0, 10) ?? "?"}|${amountCents}|${reference}`;

    out.push({ externalRef, reference, amountCents, creditDebit, valueDate });
  }
  return out;
}

/** Nur Zahlungseingänge (Haben) — relevant für den OP-Abgleich (T-13). */
export function creditTransactions(txns: ReadonlyArray<CamtTransaction>): CamtTransaction[] {
  return txns.filter((t) => t.creditDebit === "CRDT");
}
