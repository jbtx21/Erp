import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // tRPC-Aufrufe im Dev an den API-Prozess (Fastify) weiterreichen.
    proxy: { "/trpc": "http://localhost:3000" },
  },
});
