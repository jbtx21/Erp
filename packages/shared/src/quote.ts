// Angebots-Status und Funnel (Kap. 35.1). VERSENDET → NACHFASSEN (Wiedervorlage)
// → ANGENOMMEN (wird zum Auftrag) oder ABGELEHNT. ABGELEHNT/ANGENOMMEN sind final.
// Die Status spiegeln das Prisma-Enum `QuoteStatus`.

import { defineMachine } from "./statemachine.js";

export type QuoteStatus =
  | "ENTWURF"
  | "VERSENDET"
  | "NACHFASSEN"
  | "ANGENOMMEN"
  | "ABGELEHNT";

export const quoteStatusMachine = defineMachine<QuoteStatus>("QuoteStatus", {
  ENTWURF: ["VERSENDET", "ABGELEHNT"],
  VERSENDET: ["NACHFASSEN", "ANGENOMMEN", "ABGELEHNT"],
  NACHFASSEN: ["VERSENDET", "ANGENOMMEN", "ABGELEHNT"],
  ANGENOMMEN: [],
  ABGELEHNT: [],
});

export interface QuoteExpiryLike {
  status: QuoteStatus;
  gueltigBisAm?: Date | null;
}

/** Abgelaufen: noch offen (nicht final) und die Gültigkeit ist überschritten (B8). */
export function isQuoteExpired(q: QuoteExpiryLike, now: Date): boolean {
  if (q.gueltigBisAm == null) return false;
  if (quoteStatusMachine.isFinal(q.status)) return false;
  return now.getTime() > q.gueltigBisAm.getTime();
}

export class QuoteRejectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteRejectionError";
  }
}

/**
 * Prüft eine Ablehnung (B8): der Übergang → ABGELEHNT muss erlaubt sein (F2) UND
 * ein Verlustgrund ist Pflicht. Wirft StateTransitionError bzw. QuoteRejectionError.
 */
export function assertQuoteRejectable(status: QuoteStatus, verlustgrund: string): void {
  quoteStatusMachine.assert(status, "ABGELEHNT");
  if (!verlustgrund || verlustgrund.trim().length === 0) {
    throw new QuoteRejectionError("Verlustgrund ist Pflicht bei Ablehnung (Kap. 35.1).");
  }
}
