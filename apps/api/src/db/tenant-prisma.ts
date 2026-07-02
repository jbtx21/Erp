// Tenant-RLS-Verdrahtung (ADR 0004, RLS Slice 2) — macht den Prisma-Client der App
// mandantenbewusst, OHNE dass Repos/Services angefasst werden müssen:
//
//  1. Client-Extension `$allOperations` (offizielles Prisma-RLS-Muster): jede einzelne
//     Operation wird in eine Batch-Transaktion `[ set_config('app.tenant_id', $1, true),
//     query ]` gehüllt. `set_config(…, true)` ≙ SET LOCAL — transaktionslokal, kein Leak
//     über den Connection-Pool; der Wert reist parametrisiert (SQL-Injection-sicher).
//  2. `$transaction`-Abfangjäger: interaktive Transaktionen (`$transaction(async tx =>`)
//     bekommen den Tenant-Kontext ZENTRAL am Transaktionsanfang (setTenantLocal) —
//     die Repos rufen `prisma.$transaction` direkt (kein Transaktions-Helper existiert),
//     deshalb ist DIES die zentrale Stelle statt Callsite-Edits je Repo. Batch-Arrays
//     bekommen ein vorangestelltes set_config. Ein AsyncLocalStorage-Flag verhindert,
//     dass die Extension (1) Queries INNERHALB dieser Transaktionen erneut hüllt
//     (verschachtelte Transaktionen würden die Atomarität brechen — bekannte Lücke
//     des offiziellen Musters bei interaktiven Transaktionen).
//
// Aktiv NUR unter DATABASE_URL_RUNTIME (Laufzeit-Rolle texma_app, runtime-role.sql):
// unter der Owner-URL (Dev-Standard) wird kein Dekorator installiert — der Bestand
// verhält sich exakt wie zuvor (der Owner umgeht RLS ohnehin, F13/Slice-2-Schnitt).
// TODO (Slice 3): Worker (services/workers) verdrahten, sobald deren Tabellen Policies
// bekommen — bis dahin laufen Worker/Skripte unter der Owner-URL.

import { AsyncLocalStorage } from "node:async_hooks";
import { installClientDecorator, type PrismaClient } from "@texma/db";
import { currentTenantId, setTenantLocal } from "./tenant-context.js";

/** Flag „wir sind in einer Transaktion mit bereits gesetztem app.tenant_id". */
const inTenantTx = new AsyncLocalStorage<true>();

// $transaction ist stark überladen (Batch-Array vs. interaktiver Callback); der
// Abfangjäger behandelt beide Formen und reicht alles andere unverändert durch.
type AnyTransaction = (arg: unknown, opts?: unknown) => Promise<unknown>;

/**
 * Dekoriert einen PrismaClient mit der Tenant-RLS-Extension + dem
 * `$transaction`-Abfangjäger (s. Kopfkommentar). Exportiert für den
 * DB-Integrationstest (rls-slice2.db.test.ts), der die Verdrahtung
 * gegen ein echtes Postgres unter der Laufzeit-Rolle prüft.
 */
export function tenantRlsClient(base: PrismaClient): PrismaClient {
  // set_config als PrismaPromise des BASIS-Clients (läuft nicht erneut durch die Extension).
  const setTenantConfig = (tenantId: string) =>
    base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

  const extended = base.$extends({
    name: "tenant-rls",
    query: {
      // Client-Level $allOperations: greift für Modell-Operationen UND $queryRaw/$executeRaw.
      $allOperations({ args, query }) {
        const tenantId = currentTenantId();
        // Ohne Tenant-Kontext NICHT hüllen: die RLS-Policies liefern dann 0 Zeilen
        // (fail-closed, gewollt — ADR 0004); tenant-freie Queries wie /ready bleiben möglich.
        if (!tenantId || inTenantTx.getStore()) return query(args);
        return base
          .$transaction([setTenantConfig(tenantId), query(args)] as never[])
          .then((results) => (results as unknown[])[1]);
      },
    },
  }) as unknown as PrismaClient;

  return new Proxy(extended, {
    get(target, prop) {
      if (prop === "$transaction") {
        const original = Reflect.get(target, prop) as AnyTransaction;
        const wrapped: AnyTransaction = (arg, opts) => {
          const tenantId = currentTenantId();
          if (!tenantId) return original.call(target, arg, opts);
          if (typeof arg === "function") {
            // Interaktive Transaktion: Tenant-Kontext als ERSTE Anweisung setzen.
            const fn = arg as (tx: unknown) => Promise<unknown>;
            return original.call(
              target,
              // Das Flag umschließt AUCH setTenantLocal: dessen $executeRawUnsafe läuft
              // sonst selbst durch die Extension und würde in eine EIGENE Transaktion
              // (fremde Connection) gehüllt — das set_config käme nie in dieser an.
              (tx: { $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> }) =>
                inTenantTx.run(true, async () => {
                  await setTenantLocal(tx, tenantId);
                  return fn(tx);
                }),
              opts
            );
          }
          if (Array.isArray(arg)) {
            // Batch-Transaktion: set_config voranstellen, Ergebnis wieder abschneiden.
            return inTenantTx
              .run(true, () => original.call(target, [setTenantConfig(tenantId), ...arg], opts))
              .then((results) => (results as unknown[]).slice(1));
          }
          return original.call(target, arg, opts);
        };
        return wrapped;
      }
      // Methoden an den erweiterten Client binden (nicht an den Proxy) — Prisma-interne
      // #private-Felder vertragen kein fremdes `this`.
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

let installed = false;

/**
 * Installiert die Tenant-RLS-Verdrahtung am @texma/db-Singleton — muss vor dem
 * ersten DB-Zugriff laufen (buildServer ruft das als Erstes). Idempotent; ohne
 * DATABASE_URL_RUNTIME bewusst ein No-Op (Owner-URL, RLS greift dort nicht).
 */
export function installTenantRls(): void {
  if (installed) return;
  installed = true;
  if (!process.env.DATABASE_URL_RUNTIME) return;
  installClientDecorator(tenantRlsClient);
}
