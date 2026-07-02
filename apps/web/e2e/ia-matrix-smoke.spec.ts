// IA-Smoke „Matrix-Stamm als Tab": #products zeigt die Tabs „Artikel & Varianten" /
// „Farben & Größen"; der alte Deep-Link #matrixstamm landet direkt auf dem Matrix-Tab.
// Aufruf (echter Stack, wie premium-shots.spec.ts):
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm exec playwright test apps/web/e2e/ia-matrix-smoke.spec.ts
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "e2e-artifacts/ia-matrix";

test("IA: Matrix-Stamm ist Tab in Artikel/Varianten (+ Deep-Link #matrixstamm)", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  const consoleErrors: string[] = [];
  // Externe Fonts (fonts.googleapis.com) sind in der Sandbox geblockt — kein App-Fehler.
  page.on("console", (m) => { if (m.type() === "error" && !m.location().url.includes("fonts.googleapis.com")) consoleErrors.push(`${m.text()} (${m.location().url})`); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // 1) #products → Tab „Farben & Größen" anklicken (Matrix-Stamm-Sektion + Import sichtbar).
  await page.goto("/#products", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Artikel & Varianten" })).toBeVisible();
  await page.getByRole("tab", { name: "Farben & Größen" }).click();
  await expect(page.getByText("Globales Farb-/Größen-Vokabular")).toBeVisible();
  await expect(page.getByText("Größenläufe (Vorlagen)")).toBeVisible();
  await expect(page.getByText("Matrix-Import (CSV)")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/01-products-tab-farben-groessen.png`, fullPage: true });

  // 2) Alter Deep-Link #matrixstamm → Wrapper rendert ProductsPage mit aktivem Matrix-Tab.
  await page.goto("/#matrixstamm", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" }); // Hash-Wechsel ohne Reload triggert kein Re-Mount
  await expect(page.getByRole("tab", { name: "Farben & Größen" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Globales Farb-/Größen-Vokabular")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/02-deeplink-matrixstamm.png`, fullPage: true });

  expect(consoleErrors, `Console-Errors: ${consoleErrors.join(" | ")}`).toHaveLength(0);
});
