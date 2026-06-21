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
