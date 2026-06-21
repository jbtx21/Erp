// Isolierte tRPC-Instanz für das Kundenportal (B13). Eigener Context + eigene
// Procedures — getrennt vom Mitarbeiter-AppRouter. Der Principal trägt die companyId
// aus der Portal-Session; Resource-Zugriffe scopen IMMER darüber (nie über Inputs).

import { initTRPC, TRPCError } from "@trpc/server";
import type {
  PortalAuthService,
  PortalPrincipal,
} from "../modules/portal/portal-auth.service.js";
import type { CustomerPortalService } from "../modules/portal/portal.service.js";

export interface PortalContext {
  portalAuth: PortalAuthService;
  portal: CustomerPortalService;
  principal: PortalPrincipal | null;
  sessionToken: string | null;
  setSessionCookie: (token: string, maxAgeSeconds: number) => void;
  clearSessionCookie: () => void;
}

const t = initTRPC.context<PortalContext>().create();

export const portalRouter = t.router;
export const portalPublicProcedure = t.procedure;
export const portalCreateCallerFactory = t.createCallerFactory;

/** Erzwingt eine angemeldete Portal-Session; verengt principal auf non-null. */
export const portalProtectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.principal) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Anmeldung erforderlich." });
  }
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});
