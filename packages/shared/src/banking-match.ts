// Banking-Abgleich — Kap. 9.4. Testfall T-13.
// Eingehende Zahlungen (CAMT.053/MT940/FinTS/PayPal) werden gegen offene Posten
// abgeglichen. ZWEI Matching-Stufen:
//   1. Verwendungszweck → Rechnungsnummer(n). Genau eine Nummer ⇒ Zuordnung
//      (Teil-/Voll-/Skonto-/Überzahlung). Mehrere eindeutige Nummern ⇒ Sammelzahlung
//      (Mehrfachallokation FIFO). Substring-mehrdeutige Nummern ⇒ Klärung.
//   2. Fällt Stufe 1 leer aus: Fuzzy über Debitor-Name + Betrag (mit Skonto-Toleranz),
//      einzeln oder als Debitor-Sammelzahlung. Greift nur, wenn Zahlung einen
//      Auftraggebernamen und die OPs einen Debitor-Namen tragen.
// Nicht eindeutig zuordenbare Zahlungen kommen auf die Klärungsliste.

import type { Cents } from "./money.js";

export interface OpenItemRef {
  id: string;
  invoiceNumber: string;
  openCents: Cents;
  /** Debitor (Kunde) — Grundlage der 2. Matching-Stufe (Betrag + Name). Optional. */
  debtorName?: string;
  /** Fälligkeit — FIFO-Reihenfolge bei Sammelzahlung über mehrere OPs. Optional. */
  dueDate?: Date;
}

export interface IncomingPayment {
  id: string;
  /** Verwendungszweck (enthält idealerweise die Rechnungsnummer). */
  reference: string;
  amountCents: Cents;
  /** Auftraggebername aus dem Bank-/PayPal-Datensatz — 2. Matching-Stufe. Optional. */
  payerName?: string;
}

export interface MatchAllocation {
  paymentId: string;
  openItemId: string;
  /** Tatsächlich geflossenes Geld, das diesem OP zugeordnet wird. */
  allocatedCents: Cents;
  /** Gewährter Skonto, der den OP zusätzlich schließt (0 = kein Skonto). Eigene
   *  DATEV-Buchung (Erlösschmälerung), nicht Teil des Zahlbetrags. */
  skontoCents?: Cents;
}

export type ClarificationReason =
  | "KEINE_RECHNUNG_ERKANNT"
  | "MEHRDEUTIG"
  | "UEBERZAHLUNG";

export interface ClarificationItem {
  paymentId: string;
  reason: ClarificationReason;
  /** Nicht zugeordneter Restbetrag (bei Überzahlung > 0). */
  unallocatedCents: Cents;
}

export interface MatchResult {
  allocations: MatchAllocation[];
  clarifications: ClarificationItem[];
}

export interface MatchOptions {
  /** Skonto-Toleranz in Basispunkten (Default 300 = 3 %). Eine Zahlung knapp unter
   *  dem OP-Restbetrag schließt den OP mit Skonto statt eine Teilzahlung zu erzeugen. */
  skontoToleranceBps?: number;
  /** Absolute Obergrenze für den je OP gewährten Skonto in Cent (Default: keine). */
  skontoMaxCents?: number;
}

const DEFAULT_SKONTO_BPS = 300;

/** Normalisiert einen Namen für den unscharfen Debitor-Vergleich (klein, nur a–z0–9). */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Unscharfer Debitor-Abgleich: ein normalisierter Name enthält den anderen (≥4 Zeichen). */
function nameMatches(payer: string | undefined, debtor: string | undefined): boolean {
  if (!payer || !debtor) return false;
  const a = normalizeName(payer);
  const b = normalizeName(debtor);
  if (a.length < 4 || b.length < 4) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * Skonto-Betrag, mit dem `amount` den Restbetrag `open` schließen darf, oder `null`,
 * wenn die Differenz die Toleranz übersteigt bzw. die Zahlung über dem OP liegt.
 * Bei exakter Zahlung ist der Skonto 0 (gültiger Voll-Match).
 */
function skontoFor(amount: Cents, open: Cents, opts: MatchOptions): number | null {
  if (amount <= 0 || amount > open) return null;
  const gap = open - amount;
  const bps = opts.skontoToleranceBps ?? DEFAULT_SKONTO_BPS;
  const tol = Math.min(opts.skontoMaxCents ?? Number.MAX_SAFE_INTEGER, Math.floor((open * bps) / 10000));
  return gap <= tol ? gap : null;
}

/** Findet offene Posten, deren Rechnungsnummer im Verwendungszweck vorkommt. */
function findCandidates(
  payment: IncomingPayment,
  openItems: ReadonlyArray<OpenItemRef>
): OpenItemRef[] {
  const ref = payment.reference.toUpperCase();
  return openItems.filter((oi) => ref.includes(oi.invoiceNumber.toUpperCase()));
}

/** True, wenn eine Kandidaten-Rechnungsnummer Teilstring einer anderen ist (echte Mehrdeutigkeit). */
function hasSubstringAmbiguity(cands: ReadonlyArray<OpenItemRef>): boolean {
  const nums = cands.map((c) => c.invoiceNumber.toUpperCase());
  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < nums.length; j++) {
      if (i !== j && (nums[j] as string).includes(nums[i] as string)) return true;
    }
  }
  return false;
}

/** FIFO-Reihenfolge: Fälligkeit aufsteigend (ohne Datum zuletzt), dann kleinerer Restbetrag. */
function fifoOrder(ois: ReadonlyArray<OpenItemRef>, remaining: Map<string, Cents>): OpenItemRef[] {
  return [...ois].sort((a, b) => {
    const da = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return (remaining.get(a.id) ?? 0) - (remaining.get(b.id) ?? 0);
  });
}

/** Settlet eine Zahlung gegen GENAU einen OP: Voll-/Skonto-/Teil-/Überzahlung. */
function settleSingle(
  p: IncomingPayment,
  oi: OpenItemRef,
  remaining: Map<string, Cents>,
  out: MatchResult,
  opts: MatchOptions
): void {
  const open = remaining.get(oi.id) ?? 0;
  if (p.amountCents >= open) {
    out.allocations.push({ paymentId: p.id, openItemId: oi.id, allocatedCents: open });
    remaining.set(oi.id, 0);
    const overpay = p.amountCents - open;
    if (overpay > 0) {
      out.clarifications.push({ paymentId: p.id, reason: "UEBERZAHLUNG", unallocatedCents: overpay });
    }
    return;
  }
  const skonto = skontoFor(p.amountCents, open, opts);
  if (skonto != null) {
    // Zahlung knapp unter OP ⇒ mit Skonto schließen.
    out.allocations.push({ paymentId: p.id, openItemId: oi.id, allocatedCents: p.amountCents, skontoCents: skonto });
    remaining.set(oi.id, 0);
    return;
  }
  // Echte Teilzahlung — OP bleibt offen, keine Klärung.
  out.allocations.push({ paymentId: p.id, openItemId: oi.id, allocatedCents: p.amountCents });
  remaining.set(oi.id, open - p.amountCents);
}

/** Verteilt eine Zahlung FIFO über mehrere OPs (Sammelzahlung); Rest ⇒ Überzahlung. */
function settleAcross(
  p: IncomingPayment,
  ois: ReadonlyArray<OpenItemRef>,
  remaining: Map<string, Cents>,
  out: MatchResult
): void {
  let rest = p.amountCents;
  for (const oi of fifoOrder(ois, remaining)) {
    if (rest <= 0) break;
    const open = remaining.get(oi.id) ?? 0;
    if (open <= 0) continue;
    const take = Math.min(open, rest);
    out.allocations.push({ paymentId: p.id, openItemId: oi.id, allocatedCents: take });
    remaining.set(oi.id, open - take);
    rest -= take;
  }
  if (rest > 0) {
    out.clarifications.push({ paymentId: p.id, reason: "UEBERZAHLUNG", unallocatedCents: rest });
  }
}

/** 2. Stufe: Fuzzy-Match über Debitor-Name + Betrag (mit Skonto-Toleranz). */
function settleByDebtor(
  p: IncomingPayment,
  openItems: ReadonlyArray<OpenItemRef>,
  remaining: Map<string, Cents>,
  out: MatchResult,
  opts: MatchOptions
): boolean {
  if (!p.payerName) return false;
  const debCands = openItems.filter(
    (oi) => (remaining.get(oi.id) ?? 0) > 0 && nameMatches(p.payerName, oi.debtorName)
  );
  if (debCands.length === 0) return false;

  // a) Einzel-OP, dessen Restbetrag (mit Skonto) genau zur Zahlung passt.
  const exact = debCands.filter((oi) => skontoFor(p.amountCents, remaining.get(oi.id) ?? 0, opts) != null);
  if (exact.length === 1) {
    settleSingle(p, exact[0] as OpenItemRef, remaining, out, opts);
    return true;
  }
  if (exact.length > 1) {
    out.clarifications.push({ paymentId: p.id, reason: "MEHRDEUTIG", unallocatedCents: p.amountCents });
    return true;
  }

  // b) Debitor-Sammelzahlung: Betrag deckt die Summe aller offenen Posten exakt.
  const sum = debCands.reduce((s, oi) => s + (remaining.get(oi.id) ?? 0), 0);
  if (p.amountCents === sum) {
    settleAcross(p, debCands, remaining, out);
    return true;
  }
  return false;
}

/**
 * Gleicht eine Liste Zahlungen gegen offene Posten ab (T-13, Kap. 9.4).
 * Offene Posten werden über alle Zahlungen hinweg fortgeschrieben (mutiert nicht die
 * Eingabe — arbeitet auf einer Kopie der Restbeträge). Invariante: Summe der
 * `allocatedCents` einer Zahlung ≤ ihr Betrag; restlicher Überschuss steht als
 * UEBERZAHLUNG in der Klärung.
 */
export function matchPayments(
  payments: ReadonlyArray<IncomingPayment>,
  openItems: ReadonlyArray<OpenItemRef>,
  opts: MatchOptions = {}
): MatchResult {
  const remaining = new Map(openItems.map((oi) => [oi.id, oi.openCents]));
  const out: MatchResult = { allocations: [], clarifications: [] };

  for (const p of payments) {
    const candidates = findCandidates(p, openItems).filter((oi) => (remaining.get(oi.id) ?? 0) > 0);

    // Stufe 1 — über die Rechnungsnummer im Verwendungszweck.
    if (candidates.length === 1) {
      settleSingle(p, candidates[0] as OpenItemRef, remaining, out, opts);
      continue;
    }
    if (candidates.length > 1) {
      if (hasSubstringAmbiguity(candidates)) {
        out.clarifications.push({ paymentId: p.id, reason: "MEHRDEUTIG", unallocatedCents: p.amountCents });
      } else {
        settleAcross(p, candidates, remaining, out); // Sammelzahlung über mehrere klar benannte OPs
      }
      continue;
    }

    // Stufe 2 — Fuzzy über Debitor + Betrag.
    if (settleByDebtor(p, openItems, remaining, out, opts)) continue;

    out.clarifications.push({ paymentId: p.id, reason: "KEINE_RECHNUNG_ERKANNT", unallocatedCents: p.amountCents });
  }

  return out;
}
