// Dev-Server gegen das ECHTE Backend (Prisma) mit festem Demo-Nutzer (ADMIN),
// damit die Oberfläche ohne Login-Reibung ALLE Module gegen echte Daten bedient
// (read + write). Im Gegensatz zum demo-server.js (In-Memory, nur 4 Module) läuft
// hier der volle Stack über Postgres.
//
// Voraussetzung: DATABASE_URL gesetzt, Migrationen eingespielt, Seed gelaufen:
//   pnpm --filter @texma/db migrate
//   pnpm --filter @texma/api build && node apps/api/dist/scripts/seed.js
//   node apps/api/dist/scripts/dev-server.js   # API auf :3000
//   pnpm --filter @texma/web dev               # UI auf :5173
import "./load-env.js"; // MUSS zuerst stehen: lädt DATABASE_URL aus packages/db/.env
import { buildServer } from "../server.js";

const server = buildServer({
  identityVerifier: null,
  // ADMIN: alle Bereiche sichtbar (keine Rollen-Redaktion beim Durchklicken).
  demoUser: { id: "demo-admin", email: "admin@texma-gmbh.de", name: "Demo Admin", role: "ADMIN", totpEnabled: true, tenantId: "tenant_texma" },
});

const port = Number(process.env.PORT ?? 3000);
server
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => console.log(`TEXMA Dev-API (echtes Backend/Prisma) läuft auf ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
