import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
// vitest/config: defineConfig akzeptiert zusätzlich den `test`-Schlüssel (Vitest) und
// bleibt voll kompatibel zu `vite build` — eine Quelle für Dev/Build + Unit-Tests.
import { defineConfig } from "vitest/config";

// @texma/shared-Unterpfade direkt aus dem Quellcode auflösen (statt aus dem gebauten
// dist über "exports"). So läuft `pnpm dev:web` OHNE vorheriges Bauen des shared-Pakets
// — robuster für lokale Durchstiche und schnelleres HMR. Unterpfade VOR dem Basispfad.
const src = (p: string): string => fileURLToPath(new URL(`../../packages/shared/src/${p}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@texma/shared/stickerei": src("stickerei.ts"),
      "@texma/shared/markup": src("markup.ts"),
      "@texma/shared/pricing": src("pricing.ts"),
      "@texma/shared/money": src("money.ts"),
      "@texma/shared/beleg-templates": src("beleg-templates.ts"),
      "@texma/shared/pain001": src("pain001.ts"),
      "@texma/shared/order": src("order.ts"),
      "@texma/shared/tracking": src("tracking.ts"),
      "@texma/shared/vat": src("vat.ts"),
      "@texma/shared/kontenrahmen": src("kontenrahmen.ts"),
      "@texma/shared/import-mapping": src("import-mapping.ts"),
      "@texma/shared/positions-model": src("positions-model.ts"),
      "@texma/shared/veredelungsauftrag": src("veredelungsauftrag.ts"),
      "@texma/shared/garment-assets": src("garment-assets.ts"),
      "@texma/shared": src("index.ts"),
    },
  },
  server: {
    // tRPC-Aufrufe + Logo-Datei-Downloads im Dev an den API-Prozess (Fastify) weiterreichen.
    proxy: { "/trpc": "http://localhost:3000", "/logos": "http://localhost:3000" },
  },
  // Vitest (Unit) NICHT die Playwright-E2E-Specs einsammeln lassen — die laufen über
  // `pnpm test:e2e` gegen den echten Stack (eigener Runner), nicht über vitest.
  test: { exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"] },
});
