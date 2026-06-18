// Re-export des generierten Prisma-Clients + ein Singleton für die App.
// Der Client wird durch `prisma generate` nach ../generated/client erzeugt.
export * from "../generated/client/index.js";
import { PrismaClient } from "../generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __texmaPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__texmaPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__texmaPrisma = prisma;
}
