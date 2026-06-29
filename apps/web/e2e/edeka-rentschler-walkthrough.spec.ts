// E2E-Durchstich „Edeka Rentschler" gegen den ECHTEN Stack — komplexere Telefon-Anfrage mit
// mehreren Veredlern und EK-Pflicht auf ALLEN Artikeln:
//   20 Caps + Stick-Logo (extern, Stickerei),
//   350 Hoodies + Siebdruck Brust 2-farbig + Rücken 3-farbig (extern, Siebdruckerei).
//
// Prüft die Inline-Artikelanlage MIT EK: jede Freiposition wird mit Stammdaten + EK
// (Textil: Lieferant+EK, Veredelung: Veredler+EK) in den Katalog gesichert, der Veredler je
// Position (G1) gesetzt und der Veredelungs-Bezug auf die Textilposition gelegt. Verifiziert
// anschließend, dass jeder Katalogartikel einen EK trägt und die Veredelungspositionen ihren
// Veredler führen.
//
// Voraussetzungen + Aufruf wie strohaeker-walkthrough.spec.ts (eigener Runner, echter Stack):
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e

import { test, expect, request, type Page } from "@playwright/test";

const API = process.env.TEXMA_API ?? "http://localhost:3000";
const RID = String(Date.now()).slice(-7);

async function trpc(ctx: Awaited<ReturnType<typeof request.newContext>>, path: string, data: unknown): Promise<string> {
  const r = await ctx.post(`/trpc/${path}`, { data });
  expect(r.ok(), `${path} → ${r.status()}`).toBeTruthy();
  return ((await r.json()) as { result: { data: { id: string } } }).result.data.id;
}

const dataRows = (p: Page) => p.locator("table tr").filter({ has: p.locator('input[inputmode="numeric"]') });
const opt = (p: Page, re: RegExp) => p.getByRole("option", { name: re }).first();

// Freie TEXTIL-Position mit EK in den Katalog speichern (Lieferant + EK Pflicht).
async function addTextil(p: Page, o: { desc: string; ek: string; vk: string; qty: number; sku: string; lieferant: RegExp }): Promise<void> {
  await p.getByRole("button", { name: "+ Freiposition" }).click();
  const d = p.getByPlaceholder("Artikel-Nr./Name suchen oder Freitext…").last();
  await d.waitFor({ state: "visible" });
  await d.fill(o.desc);
  await p.keyboard.press("Escape");
  const r = dataRows(p).last();
  await r.locator('input[inputmode="numeric"]').nth(0).fill(String(o.qty));
  await r.locator('input[inputmode="decimal"]').nth(0).fill(o.ek);
  await r.locator('input[inputmode="decimal"]').nth(1).fill(o.vk);
  await p.keyboard.press("Tab");
  await r.getByTitle(/Details \(Platzierung/).click();
  await p.getByLabel("Artikel-Nr. (frei)").fill(o.sku);
  await p.getByRole("button", { name: /In Katalog speichern/ }).click();
  const dlg = p.getByRole("dialog");
  await dlg.getByLabel(/Lieferant \(für EK\)/).first().click();
  await opt(p, o.lieferant).click();
  await dlg.getByRole("button", { name: /Speichern & übernehmen/ }).click();
  await p.getByRole("dialog").waitFor({ state: "detached" });
}

// Freie VEREDELUNG-Position: Veredler je Position (G1) + EK + Bezug auf Textilposition + Katalog.
async function addVered(p: Page, o: { desc: string; ek: string; vk: string; sku: string; method: RegExp; veredler: RegExp; placement?: string; bezug: RegExp }): Promise<void> {
  await p.getByRole("button", { name: "+ Freiposition" }).click();
  const d = p.getByPlaceholder("Artikel-Nr./Name suchen oder Freitext…").last();
  await d.waitFor({ state: "visible" });
  await d.fill(o.desc);
  await p.keyboard.press("Escape");
  let r = dataRows(p).last();
  await r.locator("input[readonly]").first().click(); // Art-Select
  await p.getByRole("option", { name: "Veredelung" }).click();
  r = dataRows(p).last();
  await r.locator('input[inputmode="decimal"]').nth(0).fill(o.ek);
  await r.locator('input[inputmode="decimal"]').nth(1).fill(o.vk);
  await p.keyboard.press("Tab");
  await r.getByRole("button", { name: /Veredelungsdetails/ }).click();
  await p.getByLabel(/Veredler \(leer = inhouse\)/).first().click();
  await opt(p, o.veredler).click();
  if (o.placement) await p.getByLabel("Platzierung").first().fill(o.placement);
  await p.getByLabel(/Bezug \(Textil-Pos\.\)/).first().click();
  await opt(p, o.bezug).click();
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: /In Katalog speichern/ }).click();
  const dlg = p.getByRole("dialog");
  await dlg.getByLabel("Veredelungsart").click();
  await opt(p, o.method).click();
  await dlg.getByLabel("Artikel-Nr. (SKU)").fill(o.sku);
  await dlg.getByRole("button", { name: /Anlegen.*übernehmen/ }).click();
  await p.getByRole("dialog").waitFor({ state: "detached" });
}

test("Edeka: Caps+Hoodies mit EK auf allen Artikeln + Veredler je Position (G1)", async ({ page }) => {
  const api = await request.newContext({ baseURL: API });
  // Setup: Neukunde + Lieferanten (Textil/Stickerei/Siebdruckerei).
  await trpc(api, "companies.create", { name: `Edeka Rentschler ${RID}`, branche: "Lebensmittel", zahlungszielTage: 30, priceGroupKind: "STANDARD" });
  await trpc(api, "suppliers.create", { name: `Textil-Lieferant ${RID}` });
  await trpc(api, "suppliers.create", { name: `Stickerei ${RID}` });
  await trpc(api, "suppliers.create", { name: `Siebdruckerei ${RID}` });

  await page.goto("/");
  await page.getByText("Angebote", { exact: true }).first().click();
  await page.getByRole("button", { name: "+ Angebot hinzufügen" }).click();
  await page.getByPlaceholder("Kunde suchen…").fill("Edeka Rentschler");
  await opt(page, new RegExp(`Edeka Rentschler ${RID}`)).click();

  // Textilpositionen zuerst (Pos. 1/2) — Veredelungen referenzieren sie per Bezug.
  await addTextil(page, { desc: "Cap 6-Panel Edeka", ek: "3,50", vk: "7,90", qty: 20, sku: `CAP-6P-${RID}`, lieferant: new RegExp(`Textil-Lieferant ${RID}`) });
  await addTextil(page, { desc: "Hoodie Premium 350g", ek: "12,00", vk: "24,90", qty: 350, sku: `HOODIE-${RID}`, lieferant: new RegExp(`Textil-Lieferant ${RID}`) });
  await addVered(page, { desc: "Stick Logo Edeka Brust", ek: "1,20", vk: "2,50", sku: `STICK-${RID}`, method: /Stick/, veredler: new RegExp(`Stickerei ${RID}`), placement: "Brust links", bezug: /Cap/ });
  await addVered(page, { desc: "Siebdruck Brust 2-farbig", ek: "1,80", vk: "3,50", sku: `SD-BRUST-${RID}`, method: /Siebdruck/, veredler: new RegExp(`Siebdruckerei ${RID}`), placement: "Brust", bezug: /Hoodie/ });
  await addVered(page, { desc: "Siebdruck Rücken 3-farbig", ek: "2,40", vk: "4,50", sku: `SD-RUECK-${RID}`, method: /Siebdruck/, veredler: new RegExp(`Siebdruckerei ${RID}`), placement: "Rücken", bezug: /Hoodie/ });

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page).toHaveURL(/#quotes/, { timeout: 10000 });

  // Verifikation: Textilartikel landen im Verkaufskatalog (searchCatalog), Veredelungs-
  // artikel im Veredelungskatalog. Beide tragen ihren EK (s. SupplierItem im Stamm).
  for (const sku of [`CAP-6P-${RID}`, `HOODIE-${RID}`]) {
    const res = await (await api.get(`/trpc/products.searchCatalog?input=${encodeURIComponent(JSON.stringify({ query: sku, limit: 5 }))}`)).json();
    expect(JSON.stringify(res), `Verkaufskatalog-Eintrag für ${sku}`).toContain(sku);
  }
  const veredelung = JSON.stringify(await (await api.get("/trpc/products.veredelungCatalog")).json());
  for (const sku of [`STICK-${RID}`, `SD-BRUST-${RID}`, `SD-RUECK-${RID}`]) {
    expect(veredelung, `Veredelungskatalog-Eintrag für ${sku}`).toContain(sku);
  }

  await api.dispose();
});
