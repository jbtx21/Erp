// Acting-User-Kontext für den GoBD-Audit-Trail (Kap. 10: das „Wer" jeder Mutation).
// Die Services/Audit-Senken sind Singletons und kennen den Request-Nutzer nicht direkt;
// daher legt die tRPC-Schicht je Request den handelnden Nutzer in einen AsyncLocalStorage,
// den die PrismaAuditSink ausliest. So landet der echte Nutzer im Audit-Eintrag, ohne dass
// jede Service-Signatur die userId durchreichen muss.

import { AsyncLocalStorage } from "node:async_hooks";

interface AuditUserStore {
  userId: string | null;
}

const storage = new AsyncLocalStorage<AuditUserStore>();

/** Führt `fn` mit gesetztem Acting-User aus (umschließt die Resolver-Ausführung). */
export function runWithAuditUser<T>(userId: string | null, fn: () => T): T {
  return storage.run({ userId }, fn);
}

/** Aktuell handelnder Nutzer (oder null außerhalb eines Requests / vor Login). */
export function currentAuditUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
