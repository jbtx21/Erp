// tRPC-Basis (v11): Kontext, Auth-Middleware, Procedure-Builder.
import { initTRPC, TRPCError } from "@trpc/server";
import type { Role } from "@texma/shared";
import type { AuthService, AuthUser } from "../modules/auth/auth.service.js";
import type { OrderImportService } from "../modules/shop-import/order-import.service.js";
import type { OrderQueryRepository } from "../repositories/read.js";

/** Pro Request injizierte Abhängigkeiten — in Tests durch In-Memory-Varianten ersetzbar. */
export interface Context {
  orderImport: OrderImportService;
  orders: OrderQueryRepository;
  auth: AuthService;
  user: AuthUser | null;
  /** Roh-Token aus dem Cookie (für den 2FA-Zwischenschritt/Logout, wenn user noch null ist). */
  sessionToken: string | null;
  setSessionCookie: (token: string, maxAgeSeconds: number) => void;
  clearSessionCookie: () => void;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/** Erzwingt eine authentifizierte Sitzung; verengt ctx.user auf non-null. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Anmeldung erforderlich." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Rollenbasierte Procedure (RBAC, Kap. 12). */
export function roleProcedure(...roles: Role[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
    }
    return next();
  });
}
