// Dev-Seed: legt einen ADMIN-Nutzer an (idempotent). Nicht für CI/Produktion.
// Aufruf: ADMIN_EMAIL=… ADMIN_PASSWORD=… tsx src/scripts/seed-admin.ts
import { prisma } from "@texma/db";
import { Argon2Hasher } from "../modules/auth/password.js";

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? "admin@texma-gmbh.de").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe!2026";
  const passwordHash = await new Argon2Hasher().hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Administrator", role: "ADMIN", passwordHash },
  });
  console.log(`ADMIN bereit: ${user.email} (${user.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
