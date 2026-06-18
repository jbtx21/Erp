// Typisierter tRPC-Client (vanilla) gegen den Fastify+tRPC-Server.
// Der AppRouter-Typ kommt rein type-only aus @texma/api (kein Server-Code im Bundle).
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@texma/api";

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/trpc" })],
});
