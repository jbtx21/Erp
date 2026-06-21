// Typisierter tRPC-Client des Kundenportals gegen /portal/trpc.
// credentials:"include" → das httpOnly-Portal-Cookie wird mitgesendet.
// httpLink (kein Batching) — analog apps/web (robust gegen void-Input-Prozeduren).
import { createTRPCClient, httpLink } from "@trpc/client";
import type { PortalAppRouter } from "@texma/api";

export const portal = createTRPCClient<PortalAppRouter>({
  links: [
    httpLink({
      url: "/portal/trpc",
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});
