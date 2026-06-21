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
