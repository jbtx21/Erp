// Einstiegspunkt des API-Prozesses.
import { buildServer } from "./server.js";

// Typ-Export für den typisierten tRPC-Client in apps/web (rein type-only).
export type { AppRouter } from "./trpc/router.js";
// Typ-Export für den Kundenportal-Client (apps/portal, B13).
export type { PortalAppRouter } from "./trpc/portal-router.js";

const port = Number(process.env.PORT ?? 3000);

buildServer()
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => console.log(`TEXMA API läuft auf ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
