// Re-export des generierten Prisma-Clients + ein Singleton für die App.
// Der Client wird durch `prisma generate` nach ../generated/client erzeugt.
export * from "../generated/client/index.js";
import { PrismaClient } from "../generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __texmaPrisma: PrismaClient | undefined;
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
    const runtimeUrl = process.env.DATABASE_URL_RUNTIME;
    globalThis.__texmaPrisma = runtimeUrl
      ? new PrismaClient({ datasourceUrl: runtimeUrl })
      : new PrismaClient();
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
