// Auftrags-Status und seine Vorgangskette (Kap. 35.2). Storno ist aus jedem
// nicht-finalen Status möglich — Korrektur erfolgt via Storno + Neuanlage
// (Kap. 4.4 / 12.1), nicht durch Rück-Übergänge. Die Status spiegeln das
// Prisma-Enum `OrderStatus`. Erweiterung um FAKTURIERT/ABGESCHLOSSEN folgt mit B9.

import { defineMachine } from "./statemachine.js";

export type OrderStatus =
  | "ANGELEGT"
  | "IN_BEARBEITUNG"
  | "IN_PRODUKTION"
  | "VERSANDBEREIT"
  | "VERSENDET"
  | "STORNIERT";

export const orderStatusMachine = defineMachine<OrderStatus>("OrderStatus", {
  ANGELEGT: ["IN_BEARBEITUNG", "STORNIERT"],
  IN_BEARBEITUNG: ["IN_PRODUKTION", "STORNIERT"],
  IN_PRODUKTION: ["VERSANDBEREIT", "STORNIERT"],
  VERSANDBEREIT: ["VERSENDET", "STORNIERT"],
  VERSENDET: [],
  STORNIERT: [],
});
