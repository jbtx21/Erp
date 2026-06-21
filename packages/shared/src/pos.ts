// Kasse / Point of Sale (B6, Kap. 37.4). KassenSichV/§146a AO: jeder Barverkauf wird
// von der TSE signiert und unveränderbar (WORM) festgehalten. Hier nur reine Logik:
// Belegmodell + DSFinV-K-Export. Die TSE-Signatur kommt aus dem Connector (Deutsche
// Fiskal), die Persistenz aus apps/api.

import type { Cents } from "./money.js";
import { csvField } from "./csv.js";

export type PaymentArt = "BAR" | "EC";

export interface CashSaleRecord {
  belegNr: string;
  betragCents: Cents;
  art: PaymentArt;
  kassiertAm: Date;
  kassierer: string;
  /** TSE-Signatur (KassenSichV) — Pflicht. */
  tseSignatur: string;
  tseSeriennummer: string;
  tseTxId: string;
}

const isoDateTime = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** DSFinV-K-Kernzeile (Transaktion) je Kassenbeleg. */
export const DSFINVK_HEADER =
  "BON_NR;ZEITPUNKT;BETRAG;ZAHLART;KASSIERER;TSE_SERIENNUMMER;TSE_TRANSAKTION;TSE_SIGNATUR";

export function dsfinvkRow(s: CashSaleRecord): string {
  return [
    s.belegNr,
    isoDateTime(s.kassiertAm),
    (s.betragCents / 100).toFixed(2),
    s.art,
    s.kassierer,
    s.tseSeriennummer,
    s.tseTxId,
    s.tseSignatur,
  ]
    .map(csvField)
    .join(";");
}

/** DSFinV-K-Export (Transaktions-Kernsubset) der Kassenbelege eines Zeitraums. */
export function dsfinvkExport(sales: ReadonlyArray<CashSaleRecord>): string {
  return [DSFINVK_HEADER, ...sales.map(dsfinvkRow)].join("\n");
}

/** Ein Kassenbeleg ist gültig, wenn er von der TSE vollständig signiert ist. */
export function isTseSigned(s: CashSaleRecord): boolean {
  return (
    s.tseSignatur.trim().length > 0 &&
    s.tseSeriennummer.trim().length > 0 &&
    s.tseTxId.trim().length > 0
  );
}
