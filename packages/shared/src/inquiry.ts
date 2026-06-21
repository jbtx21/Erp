// Anfrage-Funnel (B20, Kap. 18.1/35.1) — durchgängige Vorgangskette
// Anfrage → Angebot → Auftrag. Vorbild Odoo crm.lead (ohne volle Pipeline). Die
// Status spiegeln das Prisma-Enum `InquiryStatus`; Übergänge laufen über F2.

import { defineMachine } from "./statemachine.js";

export type InquirySource = "WEB" | "EMAIL" | "SHOP" | "TELEFON";

export type InquiryStatus = "NEU" | "IN_BEARBEITUNG" | "ANGEBOT" | "VERWORFEN";

export const inquiryStatusMachine = defineMachine<InquiryStatus>("InquiryStatus", {
  NEU: ["IN_BEARBEITUNG", "ANGEBOT", "VERWORFEN"],
  IN_BEARBEITUNG: ["ANGEBOT", "VERWORFEN"],
  ANGEBOT: [], // konvertiert → Quote übernimmt
  VERWORFEN: [],
});

export class InquiryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InquiryError";
  }
}

/** Verwerfen verlangt einen erlaubten Übergang (F2) UND einen Pflichtgrund. */
export function assertInquiryDiscardable(status: InquiryStatus, grund: string): void {
  inquiryStatusMachine.assert(status, "VERWORFEN");
  if (!grund || grund.trim().length === 0) {
    throw new InquiryError("Verwerfungsgrund ist Pflicht (Kap. 18.1).");
  }
}

/** Kann die Anfrage zu einem Angebot konvertiert werden (Übergang erlaubt)? */
export function canConvertToQuote(status: InquiryStatus): boolean {
  return inquiryStatusMachine.can(status, "ANGEBOT");
}
