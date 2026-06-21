// Portal-tRPC-Router (B13): Login/Logout/Me + read-only eigene Aufträge. Die
// Auftragsliste scopt AUSSCHLIESSLICH über principal.companyId (aus der Session) —
// nie über einen Request-Parameter (Mandanten-Isolation).

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PortalAuthError } from "../modules/portal/portal-auth.service.js";
import {
  portalProtectedProcedure,
  portalPublicProcedure,
  portalRouter as router,
} from "./portal-trpc.js";

export const portalAppRouter = router({
  login: portalPublicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const res = await ctx.portalAuth.login(input.email, input.password);
        ctx.setSessionCookie(res.token, res.maxAgeSeconds);
        return { ok: true as const };
      } catch (e) {
        if (e instanceof PortalAuthError) {
          throw new TRPCError({
            code: e.code === "LOCKED" ? "TOO_MANY_REQUESTS" : "UNAUTHORIZED",
            message: e.message,
          });
        }
        throw e;
      }
    }),

  me: portalProtectedProcedure.query(({ ctx }) => ({
    email: ctx.principal.email,
    companyId: ctx.principal.companyId,
  })),

  logout: portalPublicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await ctx.portalAuth.logout(ctx.sessionToken);
    ctx.clearSessionCookie();
    return { ok: true as const };
  }),

  // Read-only: Auftragsstatus der EIGENEN Firma (companyId aus der Session).
  myOrders: portalProtectedProcedure.query(({ ctx }) => ctx.portal.myOrders(ctx.principal.companyId)),
});

export type PortalAppRouter = typeof portalAppRouter;
