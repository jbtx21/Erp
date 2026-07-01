// Vorzeige-Screenshots (Premium-Layout): START, Termin-Ampel, Auftragsliste.
// Belegt den neuen Apple-nahen Look (frosted Header, MetricCards, SegmentBar, weiche Karten).
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "e2e-artifacts/premium";

test("Premium-Vorzeige: START / Termin-Ampel / Aufträge", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });

  const shot = async (hash: string, name: string): Promise<void> => {
    await page.goto(`/#${hash}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600); // Daten + Layout settlen lassen
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  };

  await shot("home", "01-start");
  await shot("dashboard", "02-termin-ampel");
  await shot("orders", "03-auftraege");
  expect(true).toBe(true);
});
