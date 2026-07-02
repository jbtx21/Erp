// Dev-Seed: legt einen ADMIN-Nutzer an (idempotent). Nicht für CI/Produktion.
// Aufruf: ADMIN_EMAIL=… ADMIN_PASSWORD=… tsx src/scripts/seed-admin.ts
import { prisma } from "@texma/db";
import { Argon2Hasher } from "../modules/auth/password.js";

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? "admin@texma-gmbh.de").toLowerCase();
  // Kein hartkodiertes Default-Passwort: bei fehlendem ADMIN_PASSWORD hart abbrechen,
  // damit kein Konto mit bekanntem Passwort entsteht (auch nicht versehentlich gg. Prod).
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    console.error("ADMIN_PASSWORD fehlt oder ist zu kurz (min. 8 Zeichen). Abbruch.");
    process.exit(1);
    return;
  }
  const passwordHash = await new Argon2Hasher().hash(password);

  // Default-Tenant (ADR 0004, Slice 1): sicherstellen + den Admin daran hängen.
  await prisma.tenant.upsert({
    where: { id: "tenant_texma" }, update: {}, create: { id: "tenant_texma", name: "TEXMA" },
  });
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Administrator", role: "ADMIN", passwordHash, tenantId: "tenant_texma" },
  });
  console.log(`ADMIN bereit: ${user.email} (${user.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
