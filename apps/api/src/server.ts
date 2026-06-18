// Fastify + tRPC Server (Produktionspfad). Verdrahtet Prisma-Repositories und
// die GoBD-Audit-Senke. Reine Bootstrap-Funktion (Listen erfolgt in index.ts).

import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaAuditSink } from "./audit/prisma-audit-sink.js";
import { PrismaOrderRepository } from "./repositories/prisma-order.repository.js";
import { OrderImportService } from "./modules/shop-import/order-import.service.js";
import { appRouter } from "./trpc/router.js";
import type { Context } from "./trpc/trpc.js";

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: true });

  const repo = new PrismaOrderRepository();
  const orderImport = new OrderImportService(repo, new PrismaAuditSink());

  server.get("/health", async () => ({ ok: true }));

  void server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: (): Context => ({ orderImport, orders: repo }),
    },
  });

  return server;
}
