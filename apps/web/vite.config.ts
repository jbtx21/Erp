import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

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
      "@texma/shared/pain001": src("pain001.ts"),
      "@texma/shared/order": src("order.ts"),
      "@texma/shared": src("index.ts"),
    },
  },
  server: {
    // tRPC-Aufrufe + Logo-Datei-Downloads im Dev an den API-Prozess (Fastify) weiterreichen.
    proxy: { "/trpc": "http://localhost:3000", "/logos": "http://localhost:3000" },
  },
});
