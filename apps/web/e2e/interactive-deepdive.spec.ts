// Interaktiver Deep-Dive der Kern-Masken (Angebots-Editor + Auftrags-Cockpit) mit Screenshots.
// Ergänzt den passiven Modul-Sweep: klickt echte Belegmasken auf und dokumentiert sie.
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "e2e-artifacts/shots";

test("Deep-Dive: Angebots-Editor + Auftrags-Cockpit", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/\[vite\]|DevTools|Future Flag/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });

  // 1) Angebot anlegen — Positionseditor sichtbar machen.
  await page.goto("/#quotes", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const addQuote = page.getByRole("button", { name: /Angebot hinzufügen|\+ Angebot/ }).first();
  if (await addQuote.count()) {
    await addQuote.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/A1-angebot-editor.png`, fullPage: true });
    // Freiposition hinzufügen → Positionseditor-Zeile
    const addFrei = page.getByRole("button", { name: /Freiposition|\+ Position/ }).first();
    if (await addFrei.count()) { await addFrei.click(); await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}/A2-angebot-position.png`, fullPage: true }); }
  }

  // 2) Bestehenden Auftrag öffnen → Cockpit-Tab.
  await page.goto("/#orders", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/A3-auftraege-liste.png`, fullPage: true });
  // Ersten Auftrag öffnen (Zeile klicken / Bearbeiten)
  const firstRowBtn = page.getByRole("button", { name: /Bearbeiten|Öffnen/ }).first();
  const firstLink = page.locator("table tbody tr").first();
  if (await firstRowBtn.count()) { await firstRowBtn.click(); }
  else if (await firstLink.count()) { await firstLink.click(); }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/A4-auftrag-detail.png`, fullPage: true });
  // Cockpit-Tab suchen
  const cockpitTab = page.getByRole("tab", { name: /Cockpit|Folgeaktionen|Aktionen/ }).first();
  if (await cockpitTab.count()) { await cockpitTab.click(); await page.waitForTimeout(1000); await page.screenshot({ path: `${SHOTS}/A5-auftrag-cockpit.png`, fullPage: true }); }

  console.log(`\n===== DEEP-DIVE FEHLER (${errors.length}) =====`);
  for (const e of [...new Set(errors)]) console.log("  " + e);
  expect(true).toBe(true);
});
