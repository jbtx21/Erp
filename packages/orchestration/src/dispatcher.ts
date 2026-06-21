// Outbox-Dispatcher (Kap. 32): routet ein Outbox-Event anhand seines `type` an den
// passenden Handler. Unbekannte Typen werfen → der Relay verbucht Retry/DEAD. Rein
// und transportfrei; konkrete Handler (Shop-Push, …) liegen im Worker-Laufzeitpaket.

import type { Dispatcher, OutboxRecord } from "./types.js";

export type OutboxHandler = (record: OutboxRecord) => Promise<void>;

export class UnknownOutboxTypeError extends Error {
  constructor(type: string) {
    super(`Kein Handler für Outbox-Event-Typ "${type}".`);
    this.name = "UnknownOutboxTypeError";
  }
}

/** Baut einen Dispatcher, der `record.type` auf den jeweiligen Handler abbildet. */
export function createDispatcher(handlers: Record<string, OutboxHandler>): Dispatcher {
  return async (record: OutboxRecord): Promise<void> => {
    const handler = handlers[record.type];
    if (!handler) throw new UnknownOutboxTypeError(record.type);
    await handler(record);
  };
}
