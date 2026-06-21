import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Portal-tRPC im Dev an den API-Prozess (Fastify) weiterreichen.
    proxy: { "/portal": "http://localhost:3000" },
  },
});
