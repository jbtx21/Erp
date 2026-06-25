// Auftrags-Status und seine Vorgangskette (Kap. 35.2). Storno ist aus jedem
// nicht-finalen Status bis VERSANDBEREIT möglich — Korrektur via Storno + Neuanlage
// (Kap. 4.4 / 12.1), nicht durch Rück-Übergänge. Ab VERSENDET läuft die Nachkette
// VERSENDET → FAKTURIERT → ABGESCHLOSSEN (B9/K-26). Spiegelt das Prisma-Enum.

import { defineMachine } from "./statemachine.js";

export type OrderStatus =
  | "ANGELEGT"
  | "IN_BEARBEITUNG"
  | "IN_PRODUKTION"
  | "VERSANDBEREIT"
  | "VERSENDET"
  | "FAKTURIERT"
  | "ABGESCHLOSSEN"
  | "STORNIERT";

export const orderStatusMachine = defineMachine<OrderStatus>("OrderStatus", {
  ANGELEGT: ["IN_BEARBEITUNG", "STORNIERT"],
  IN_BEARBEITUNG: ["IN_PRODUKTION", "STORNIERT"],
  IN_PRODUKTION: ["VERSANDBEREIT", "STORNIERT"],
  VERSANDBEREIT: ["VERSENDET", "STORNIERT"],
  VERSENDET: ["FAKTURIERT"],
  FAKTURIERT: ["ABGESCHLOSSEN"],
  ABGESCHLOSSEN: [],
  STORNIERT: [],
});

// Ab Versand (und danach) bzw. bei Storno ist die Produktion eines Auftrags
// abgeschlossen — relevant für Ampel/Wiedervorlage-Tracking. Wichtig: VERSENDET ist
// KEIN Endzustand der Maschine mehr (Nachkette FAKTURIERT/ABGESCHLOSSEN), daher ein
// eigenes Prädikat statt `=== "VERSENDET"`.
const PRODUCTION_DONE_STATES: ReadonlySet<OrderStatus> = new Set([
  "VERSENDET",
  "FAKTURIERT",
  "ABGESCHLOSSEN",
  "STORNIERT",
]);

/** Produktion abgeschlossen (versendet/fakturiert/abgeschlossen oder storniert)? */
export function isProductionDone(status: OrderStatus): boolean {
  return PRODUCTION_DONE_STATES.has(status);
}

/** Menschenlesbare deutsche Bezeichnung eines Auftragsstatus (UI/Benachrichtigungen). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  ANGELEGT: "Angelegt",
  IN_BEARBEITUNG: "In Bearbeitung",
  IN_PRODUKTION: "In Produktion",
  VERSANDBEREIT: "Versandbereit",
  VERSENDET: "Versendet",
  FAKTURIERT: "Fakturiert",
  ABGESCHLOSSEN: "Abgeschlossen",
  STORNIERT: "Storniert",
};

/** Label eines Status; unbekannte Werte unverändert zurück (defensiv). */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status as OrderStatus] ?? status;
}
