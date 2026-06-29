import { defineConfig, devices } from "@playwright/test";

// E2E-Tests laufen gegen den lokal gestarteten Dev-Stack (Web :5173, API :3000).
// Sie sind KEIN Teil von `pnpm test` (vitest) — sie brauchen den echten Stack +
// Postgres. Browser sind in der Umgebung vorinstalliert; PW_CHROMIUM pinnt die
// Chromium-Binary (Versions-Mismatch zwischen @playwright/test und Browser-Revision).
export default defineConfig({
  testDir: "./apps/web/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TEXMA_WEB ?? "http://localhost:5173",
    trace: "on-first-retry",
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
