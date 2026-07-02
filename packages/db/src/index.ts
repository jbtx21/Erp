// Re-export des generierten Prisma-Clients + ein Singleton für die App.
// Der Client wird durch `prisma generate` nach ../generated/client erzeugt.
export * from "../generated/client/index.js";
import { PrismaClient } from "../generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __texmaPrisma: PrismaClient | undefined;
}

// Dekorator-Haken für die App-Schicht (ADR 0004, RLS Slice 2): apps/api hängt hier
// die Tenant-RLS-Verdrahtung ein (apps/api/src/db/tenant-prisma.ts), OHNE dass
// packages/db den apps/api-Tenant-Kontext importieren muss (Abhängigkeitsrichtung).
// Muss VOR dem ersten Client-Zugriff installiert werden (buildServer tut das).
type ClientDecorator = (client: PrismaClient) => PrismaClient;
let clientDecorator: ClientDecorator | null = null;

export function installClientDecorator(decorator: ClientDecorator): void {
  if (globalThis.__texmaPrisma) {
    throw new Error("installClientDecorator: Prisma-Client wurde bereits erzeugt — Dekorator muss vor dem ersten DB-Zugriff installiert werden.");
  }
  clientDecorator = decorator;
}

// Lazy-Singleton: der Client wird erst beim ERSTEN Zugriff erzeugt (nicht beim
// Import). So wirft ein bloßer Import ohne DATABASE_URL nicht — wichtig, damit
// DB-unabhängige Module/Tests den Client referenzieren können, ohne ihn zu nutzen.
function getClient(): PrismaClient {
  if (!globalThis.__texmaPrisma) {
    // RLS-Rollentrennung (ADR 0004, Slice 1): ist DATABASE_URL_RUNTIME gesetzt, verbindet
    // sich der App-Client über die Laufzeit-Rolle texma_app (ohne Ownership/BYPASSRLS,
    // packages/db/sql/runtime-role.sql); DATABASE_URL bleibt die Migrations-/Owner-Rolle
    // für `prisma migrate`. Sonst würde der Table Owner RLS still umgehen (F13).
    //
    // ACHTUNG ab Slice 2: unter DATABASE_URL_RUNTIME erzwingen die RLS-Policies den
    // Tenant-Kontext — JEDE Query braucht ein transaktionslokales `app.tenant_id`
    // (set_config), sonst liefert sie 0 Zeilen (fail-closed). Die Verdrahtung
    // übernimmt der Dekorator aus apps/api (tenant-prisma.ts, offizielle Prisma-
    // RLS-Extension); Prozesse ohne Dekorator (z. B. Skripte) müssen unter der
    // Owner-URL laufen oder den Kontext selbst setzen.
    const runtimeUrl = process.env.DATABASE_URL_RUNTIME;
    const base = runtimeUrl
      ? new PrismaClient({ datasourceUrl: runtimeUrl })
      : new PrismaClient();
    globalThis.__texmaPrisma = clientDecorator ? clientDecorator(base) : base;
  }
  return globalThis.__texmaPrisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
