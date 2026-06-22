// Positionsart Textil/Veredelung/Sonstiges (Veredelungskern, Kap. 4.4/11) und reine
// Summierung je Art — z. B. um Textil- und Veredelungsumsatz getrennt auszuweisen.

import { lineNet, type Cents } from "./money.js";

export type PositionKind = "TEXTIL" | "VEREDELUNG" | "SONSTIGE";

export const POSITION_KINDS: ReadonlyArray<{ value: PositionKind; label: string }> = [
  { value: "TEXTIL", label: "Textil" },
  { value: "VEREDELUNG", label: "Veredelung" },
  { value: "SONSTIGE", label: "Sonstiges" },
];

export interface KindLine {
  kind: PositionKind;
  qty: number;
  unitNetCents: Cents;
}

export interface KindTotals {
  textilCents: Cents;
  veredelungCents: Cents;
  sonstigeCents: Cents;
  totalCents: Cents;
}

/** Summiert die Netto-Zeilenbeträge je Positionsart. */
export function sumByKind(lines: ReadonlyArray<KindLine>): KindTotals {
  const t: KindTotals = { textilCents: 0, veredelungCents: 0, sonstigeCents: 0, totalCents: 0 };
  for (const l of lines) {
    const net = lineNet(l.qty, l.unitNetCents);
    t.totalCents += net;
    if (l.kind === "TEXTIL") t.textilCents += net;
    else if (l.kind === "VEREDELUNG") t.veredelungCents += net;
    else t.sonstigeCents += net;
  }
  return t;
}
