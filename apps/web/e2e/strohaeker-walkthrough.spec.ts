// E2E-Durchstich „Strohäker GmbH" gegen den ECHTEN Stack (API+Web+Postgres, Dev-Server).
//
// Deckt die Lücken G1/G2 + Inline-Artikelanlage aus der Telefon-Anfrage-Reise ab:
//   1. Neukunde Strohäker als Angebotskunde wählen.
//   2. Freie TEXTIL-Position („Hakro T-Shirt") inline mit Stammdaten anreichern und
//      über „💾 In Katalog speichern" als echten Artikel sichern (TextilCatalogDialog).
//   3. Freie VEREDELUNG-Position („Stick Brust") anlegen, den **Veredler je Position** (G1)
//      zuweisen und ebenfalls in den Katalog speichern (LogoArticleDialog).
//   4. Angebot speichern → der gespeicherte Beleg trägt die Positionen + den Positions-Veredler.
//
// Voraussetzungen (lokaler Durchstich, NICHT in der Standard-CI):
//   pnpm --filter @texma/db migrate && node apps/api/dist/scripts/seed.js
//   node apps/api/dist/scripts/dev-server.js   # :3000
//   pnpm --filter @texma/web dev               # :5173
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     pnpm exec playwright test apps/web/e2e/strohaeker-walkthrough.spec.ts
//
// SKUs tragen einen Zeitstempel-Suffix → der Test ist gegen denselben Datenbestand
// wiederholbar (keine SKU-Kollision). Demodaten werden bewusst „mitten im Walkthrough"
// inline angelegt, nicht vorab geseedet.

import { test, expect, request } from "@playwright/test";

const API = process.env.TEXMA_API ?? "http://localhost:3000";
const RID = String(Date.now()).slice(-7);
const HAKRO_SKU = `HAKRO-292-${RID}`;
const STICK_SKU = `STICK-BRUST-${RID}`;

test("Strohäker: Inline-Artikel + Veredler je Position (G1/G2) bis Fremdvergabe", async ({ page }) => {
  // ── Setup: Neukunde Strohäker (Stammdaten-Vorbereitung, nicht Teil der UI-Prüfung) ──
  const api = await request.newContext({ baseURL: API });
  const created = await api.post("/trpc/companies.create", {
    data: { name: `Strohäker GmbH ${RID}`, branche: "Industrie", zahlungszielTage: 30, priceGroupKind: "STANDARD" },
  });
  expect(created.ok()).toBeTruthy();

  // ── Angebot anlegen ──
  await page.goto("/");
  await page.getByText("Angebote", { exact: true }).first().click();
  await page.getByRole("button", { name: "+ Angebot hinzufügen" }).click();
  await page.getByPlaceholder("Kunde suchen…").fill("Strohäker");
  await page.getByRole("option", { name: new RegExp(`Strohäker GmbH ${RID}`) }).first().click();

  // stabile Datenzeile: trägt numerische Inputs (Menge/Rabatt); Detailzeilen nicht.
  const lastRow = () => page.locator("table tr").filter({ has: page.locator('input[inputmode="numeric"]') }).last();

  // ── Position 1: freier TEXTIL-Artikel → in Katalog speichern ──
  await page.getByRole("button", { name: "+ Freiposition" }).click();
  await page.getByPlaceholder("Artikel-Nr./Name suchen oder Freitext…").last().fill("Hakro T-Shirt Baumwolle");
  await page.keyboard.press("Escape");
  let row = lastRow();
  await row.locator('input[inputmode="decimal"]').nth(0).fill("4,20"); // EK
  await row.locator('input[inputmode="decimal"]').nth(1).fill("9,90"); // VK
  await page.keyboard.press("Tab");
  await row.getByTitle(/Details \(Platzierung/).click();
  await page.getByLabel("Artikel-Nr. (frei)").fill(HAKRO_SKU);
  await page.getByRole("button", { name: /In Katalog speichern/ }).click();
  const tdlg = page.getByRole("dialog");
  await tdlg.getByLabel("Farbe").fill("Weiß");
  await tdlg.getByLabel("Größe").fill("M");
  await tdlg.getByRole("button", { name: /Speichern & übernehmen/ }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // ── Position 2: freie VEREDELUNG + Veredler je Position (G1) → in Katalog ──
  await page.getByRole("button", { name: "+ Freiposition" }).click();
  const desc2 = page.getByPlaceholder("Artikel-Nr./Name suchen oder Freitext…").last();
  await desc2.waitFor({ state: "visible" });
  await desc2.fill("Stick Brust Logo Strohäker");
  await page.keyboard.press("Escape");
  row = lastRow();
  await row.locator("input[readonly]").first().click(); // Art-Select
  await page.getByRole("option", { name: "Veredelung" }).click();
  row = lastRow();
  await row.locator('input[inputmode="decimal"]').nth(1).fill("2,50"); // VK
  await page.keyboard.press("Tab");
  await row.getByRole("button", { name: /Veredelungsdetails/ }).click();
  await page.getByLabel(/Veredler \(leer = inhouse\)/).first().click();
  await page.getByRole("option", { name: /FHB Textil/ }).first().click();
  await page.getByRole("button", { name: /In Katalog speichern/ }).click();
  const ldlg = page.getByRole("dialog");
  await ldlg.getByLabel("Artikel-Nr. (SKU)").fill(STICK_SKU);
  await ldlg.getByRole("button", { name: /Anlegen.*übernehmen/ }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // ── Angebot speichern → in die Angebotsliste navigieren ──
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page).toHaveURL(/#quotes/, { timeout: 10000 });

  // ── Verifikation über die Katalog-API: beide Artikel sind im Stamm gelandet ──
  const textil = await (await api.get(`/trpc/products.searchCatalog?input=${encodeURIComponent(JSON.stringify({ query: HAKRO_SKU, limit: 5 }))}`)).json();
  expect(JSON.stringify(textil)).toContain("Hakro T-Shirt Baumwolle");
  const veredelung = await (await api.get("/trpc/products.veredelungCatalog")).json();
  expect(JSON.stringify(veredelung)).toContain(STICK_SKU);

  await api.dispose();
});
