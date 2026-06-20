import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // tRPC-Aufrufe + Logo-Datei-Downloads im Dev an den API-Prozess (Fastify) weiterreichen.
    proxy: { "/trpc": "http://localhost:3000", "/logos": "http://localhost:3000" },
  },
});
