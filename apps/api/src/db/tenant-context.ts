// Tenant-Kontext (ADR 0004, RLS Slice 1) — analog zum Audit-User-Kontext (Kap. 10):
// die tRPC-Schicht legt den Mandanten des authentifizierten Nutzers je Request in
// einen AsyncLocalStorage, damit Services/Repos (Singletons) ihn lesen können, ohne
// dass jede Signatur eine tenantId durchreichen muss. In Slice 1 ist der Kontext
// vorbereitend (keine erzwingenden Policies); ab Slice 2 hüllt die Prisma-Schicht
// jede Operation in eine Transaktion mit `SET LOCAL app.tenant_id` (setTenantLocal).

import { AsyncLocalStorage } from "node:async_hooks";

/** Default-Tenant „TEXMA" — Backfill-Ziel der Migration 0121; Seed/Dev-Login nutzen ihn. */
export const DEFAULT_TENANT_ID = "tenant_texma";

interface TenantStore {
  tenantId: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/** Führt `fn` mit gesetztem Mandanten aus (umschließt die Resolver-Ausführung). */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/** Aktiver Mandant (oder null außerhalb eines Requests / vor Login). */
export function currentTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

/** Minimaler Transaktions-Client (PrismaClient bzw. $transaction-tx genügen). */
export interface TenantTx {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/**
 * Setzt `app.tenant_id` TRANSAKTIONSLOKAL (`set_config(…, true)` ≙ SET LOCAL) für die
 * RLS-Policies ab Slice 2. Parametrisiert ($1-Platzhalter, Wert reist als Bind-Parameter)
 * — SQL-Injection-sicher, obwohl `$executeRawUnsafe` benutzt wird (nötig, weil
 * `SET LOCAL` selbst keine Parameter erlaubt; `set_config` schon). Nur innerhalb einer
 * Transaktion sinnvoll: auf einer gepoolten Connection wäre ein bloßes `SET` ein Leak.
 */
export async function setTenantLocal(tx: TenantTx, tenantId: string): Promise<void> {
  await tx.$executeRawUnsafe("SELECT set_config('app.tenant_id', $1, true)", tenantId);
}
