// Typisierter tRPC-Client (vanilla) gegen den Fastify+tRPC-Server.
// credentials:"include" → das httpOnly-Session-Cookie wird mitgesendet.
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@texma/api";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});
