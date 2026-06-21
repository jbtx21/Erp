// Muster-Leihgut (B5, Kap. 37.3). Reine Fristen-/Status-Logik: 21 Tage nach Ausgabe
// wird ein nicht zurückgegebenes Muster fällig und zum Listenpreis berechnet. Die
// Frist läuft als DueItem-Wiedervorlage, der Musterbestand über das F4-Ledger.

import { defineMachine } from "./statemachine.js";

export const SAMPLE_LOAN_DAYS = 21;

export type SampleLoanStatus = "VERLIEHEN" | "ZURUECK" | "BERECHNET";

// VERLIEHEN → zurückgegeben (ZURUECK) ODER berechnet (BERECHNET). Beide final.
export const sampleLoanMachine = defineMachine<SampleLoanStatus>("SampleLoan", {
  VERLIEHEN: ["ZURUECK", "BERECHNET"],
  ZURUECK: [],
  BERECHNET: [],
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fälligkeitsdatum = Ausgabe + 21 Tage. */
export function sampleDueDate(ausgegebenAm: Date, days = SAMPLE_LOAN_DAYS): Date {
  return new Date(ausgegebenAm.getTime() + days * DAY_MS);
}

export interface SampleLoanLike {
  ausgegebenAm: Date;
  status: SampleLoanStatus;
}

/** Überfällig: noch verliehen UND Frist erreicht/überschritten. */
export function isSampleOverdue(
  loan: SampleLoanLike,
  now: Date,
  days = SAMPLE_LOAN_DAYS
): boolean {
  if (loan.status !== "VERLIEHEN") return false;
  return now.getTime() >= sampleDueDate(loan.ausgegebenAm, days).getTime();
}
