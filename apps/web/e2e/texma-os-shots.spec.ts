// TEXMA-OS-Abnahme-Screenshots (Design-Handoff Juli 2026): START, Termin-Ampel,
// Aufträge, Angebote. Belegt den TEXMA-OS-Look (Glas-Shell mit Modul-Kacheln,
// ABC Diatype, KPI-Karten r18, Tabellen-Karten ohne Zebra) und erfasst
// Console-Fehler (fonts.googleapis-Sandbox-Block ausgenommen).
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "e2e-artifacts/texma-os";
const IGNORE = [/fonts\.googleapis/i, /fonts\.gstatic/i, /net::ERR_/i, /Failed to load resource/i];

test("TEXMA OS: START / Termin-Ampel / Aufträge / Angebote", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (IGNORE.some((re) => re.test(t))) return;
    consoleErrors.push(t.slice(0, 300));
  });

  const shot = async (hash: string, name: string): Promise<void> => {
    await page.goto(`/#${hash}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800); // Daten + Layout + Fonts settlen lassen
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  };

  await shot("home", "01-start");
  await shot("dashboard", "02-termin-ampel");
  await shot("orders", "03-auftraege");
  await shot("quotes", "04-angebote");

  expect(consoleErrors, `Console-Fehler: ${consoleErrors.join(" | ")}`).toEqual([]);
});
