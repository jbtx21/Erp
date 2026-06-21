// Lead/Interessent (B15, Kap. 18.1) — leichter Prospect VOR der Firma. Funnel über
// F2; Konvertierung erst aus QUALIFIZIERT. Reuse der InquirySource als Herkunft.

import { defineMachine } from "./statemachine.js";

export type LeadStatus =
  | "NEU"
  | "KONTAKTIERT"
  | "QUALIFIZIERT"
  | "KONVERTIERT"
  | "VERWORFEN";

export const leadStatusMachine = defineMachine<LeadStatus>("LeadStatus", {
  NEU: ["KONTAKTIERT", "QUALIFIZIERT", "VERWORFEN"],
  KONTAKTIERT: ["QUALIFIZIERT", "VERWORFEN"],
  QUALIFIZIERT: ["KONVERTIERT", "VERWORFEN"],
  KONVERTIERT: [], // → Company übernimmt
  VERWORFEN: [],
});

export class LeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadError";
  }
}

/** Konvertierbar (→ Company) nur aus einem qualifizierten Lead. */
export function canConvertLead(status: LeadStatus): boolean {
  return leadStatusMachine.can(status, "KONVERTIERT");
}

/** Verwerfen verlangt einen erlaubten Übergang (F2) UND einen Pflichtgrund. */
export function assertLeadDiscardable(status: LeadStatus, grund: string): void {
  leadStatusMachine.assert(status, "VERWORFEN");
  if (!grund || grund.trim().length === 0) {
    throw new LeadError("Verwerfungsgrund ist Pflicht (Kap. 18.1).");
  }
}
