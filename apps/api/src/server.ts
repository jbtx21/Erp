// Fastify + tRPC Server (Produktionspfad). Verdrahtet Prisma-Repositories, Auth
// (Session-Cookie + RBAC) und die GoBD-Audit-Senke.

import cookie from "@fastify/cookie";
import {
  type CreateFastifyContextOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaAuditSink } from "./audit/prisma-audit-sink.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { Argon2Hasher } from "./modules/auth/password.js";
import { OtpauthTotpService } from "./modules/auth/totp.js";
import { OrderImportService } from "./modules/shop-import/order-import.service.js";
import { PrismaSessionRepository, PrismaUserRepository } from "./repositories/prisma-auth.repository.js";
import { PrismaOrderRepository } from "./repositories/prisma-order.repository.js";
import { appRouter } from "./trpc/router.js";
import type { Context } from "./trpc/trpc.js";

const COOKIE_NAME = "sid";
const secure = process.env.NODE_ENV === "production";

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: true });
  void server.register(cookie);

  const repo = new PrismaOrderRepository();
  const orderImport = new OrderImportService(repo, new PrismaAuditSink());
  const auth = new AuthService(
    new PrismaUserRepository(),
    new PrismaSessionRepository(),
    new PrismaAuditSink(),
    new Argon2Hasher(),
    new OtpauthTotpService()
  );

  server.get("/health", async () => ({ ok: true }));

  void server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: async ({ req, res }: CreateFastifyContextOptions): Promise<Context> => {
        const sessionToken = req.cookies[COOKIE_NAME] ?? null;
        const user = sessionToken ? await auth.resolveSession(sessionToken) : null;
        return {
          orderImport,
          orders: repo,
          auth,
          user,
          sessionToken,
          setSessionCookie: (token, maxAgeSeconds) =>
            void res.setCookie(COOKIE_NAME, token, {
              httpOnly: true,
              sameSite: "lax",
              secure,
              path: "/",
              maxAge: maxAgeSeconds,
            }),
          clearSessionCookie: () => void res.clearCookie(COOKIE_NAME, { path: "/" }),
        };
      },
    },
  });

  return server;
}
