// Typisierter tRPC-Client (vanilla) gegen den Fastify+tRPC-Server.
// credentials:"include" → das httpOnly-Session-Cookie wird mitgesendet.
// Bewusst httpLink (kein Batching): gleichzeitig gefeuerte Queries würden sonst zu einer
// komma-verketteten Sammel-Route gebündelt, die der Fastify-Adapter bei void-Input-
// Prozeduren (Lücke in der Input-Map) mit 404 ablehnt. Eine Request je Aufruf ist für ein
// internes ERP unkritisch und robuster.
import { createTRPCClient, httpLink } from "@trpc/client";
import type { AppRouter } from "@texma/api";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: "/trpc",
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});
