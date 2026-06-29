// E2E-Durchstich „Farverig" (Wiederverkäufer) gegen den ECHTEN Stack — Schwerpunkt auf den
// neuen Funktionen: 2 Stanley/Stella Oversized-Shirts (eines als ALTERNATIVE) + Stick auf der
// Brust Mitte mit einer EK-MENGENSTAFFEL (6 Stufen, je Stufe ein eigener EK).
//
// Verifiziert browserseitig + über die API: die Stick-EK-Staffel landet als VariantEkTier
// (6 Stufen), die Angebots-Staffel (pricing.staffel) zeigt den EK je Stufe (nicht mehr einen
// flachen EK für alle), und die Alternativposition ist als solche markiert.
//
// Die Folgekette (Angebot→Auftrag→Produktion→Lieferschein→Rechnung + alle Mails inkl.
// Veredelungsauftrag an die Stickerei) wurde live über tRPC durchgespielt; dieser Spec deckt
// den frontendseitig neuen Erfassungs-Teil ab. Aufruf wie die anderen Specs (pnpm test:e2e).

import { test, expect, request, type Page } from "@playwright/test";

const API = process.env.TEXMA_API ?? "http://localhost:3000";
const RID = String(Date.now()).slice(-7);
const STICK_SKU = `STICK-FARV-${RID}`;
// Stick-EK je Stück gestaffelt nach Menge (Cent): 1=4,37 … 250=2,87.
const EK_STAFFEL: ReadonlyArray<[number, string]> = [[1, "4,37"], [10, "4,02"], [25, "3,53"], [50, "3,21"], [100, "3,04"], [250, "2,87"]];

const dataRows = (p: Page) => p.locator("table tr").filter({ has: p.locator('input[inputmode="numeric"]') });
const opt = (p: Page, re: RegExp) => p.getByRole("option", { name: re }).first();

async function addTextil(p: Page, o: { desc: string; ek: string; vk: string; qty: number; sku: string; lieferant: RegExp; alternativ?: boolean }): Promise<void> {
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
  if (o.alternativ) await p.getByText("Alternativposition").click();
  await p.getByRole("button", { name: /In Katalog speichern/ }).click();
  const dlg = p.getByRole("dialog");
  await dlg.getByLabel(/Lieferant \(für EK\)/).first().click();
  await opt(p, o.lieferant).click();
  await dlg.getByRole("button", { name: /Speichern & übernehmen/ }).click();
  await p.getByRole("dialog").waitFor({ state: "detached" });
}

test("Farverig: Alternativ-Shirt + Stick mit EK-Mengenstaffel (6 Stufen)", async ({ page }) => {
  const api = await request.newContext({ baseURL: API });
  await api.post("/trpc/companies.create", { data: { name: `Farverig ${RID}`, branche: "Merchandise", zahlungszielTage: 30, priceGroupKind: "WIEDERVERKAEUFER" } });
  await api.post("/trpc/suppliers.create", { data: { name: `Stickerei Farverig ${RID}`, email: "stick@stickerei-farverig.de" } });

  await page.goto("/");
  await page.getByText("Angebote", { exact: true }).first().click();
  await page.getByRole("button", { name: "+ Angebot hinzufügen" }).click();
  await page.getByPlaceholder("Kunde suchen…").fill("Farverig");
  await opt(page, new RegExp(`Farverig ${RID}`)).click();

  await addTextil(page, { desc: "Stanley/Stella Oversized T-Shirt", ek: "6,80", vk: "13,90", qty: 100, sku: `STST-OVS-${RID}`, lieferant: /Stanley\/Stella/ });
  await addTextil(page, { desc: "Stanley/Stella Oversized Heavy (Alt.)", ek: "8,20", vk: "15,90", qty: 100, sku: `STST-HVY-${RID}`, lieferant: /Stanley\/Stella/, alternativ: true });

  // Stick mit EK-Staffel über den Logo/Veredelung-Dialog.
  await page.getByRole("button", { name: "+ Logo/Veredelung" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor({ state: "visible" });
  await dlg.getByLabel("Bezeichnung").fill("Stick Logo Brust Mitte");
  await dlg.getByLabel("Artikel-Nr. (SKU)").fill(STICK_SKU);
  await dlg.getByLabel("Veredler", { exact: true }).first().click();
  await opt(page, new RegExp(`Stickerei Farverig ${RID}`)).click();
  await dlg.getByLabel(/EK beim Veredler/).fill("4,37"); // füllt Stufe 1
  // Stufe 0 (minMenge 1) explizit, dann 5 weitere Stufen mit eigenem EK.
  await dlg.locator('input[inputmode="numeric"]').nth(0).fill("1");
  await dlg.locator('input[inputmode="decimal"]').nth(1).fill("4,37");
  for (let i = 1; i < EK_STAFFEL.length; i++) {
    await dlg.getByRole("button", { name: /\+ Staffelstufe/ }).click();
    const num = dlg.locator('input[inputmode="numeric"]');
    const dec = dlg.locator('input[inputmode="decimal"]');
    await num.nth((await num.count()) - 1).fill(String(EK_STAFFEL[i]![0]));
    await dec.nth((await dec.count()) - 2).fill(EK_STAFFEL[i]![1]); // EK der letzten Stufe
  }
  await dlg.getByRole("button", { name: /Anlegen.*übernehmen/ }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page).toHaveURL(/#quotes/, { timeout: 10000 });

  // Verifikation: Stick führt eine 6-stufige EK-Staffel und die Anzeige-Staffel zeigt den EK je Stufe.
  const cat = await (await api.get(`/trpc/products.veredelungCatalog`)).json();
  const entry = (cat as { result: { data: Array<{ variantId: string; sku: string }> } }).result.data.find((e) => e.sku === STICK_SKU);
  expect(entry, "Stick im Veredelungskatalog").toBeTruthy();
  const companies = await (await api.get("/trpc/companies.list")).json();
  const co = (companies as { result: { data: Array<{ id: string; name: string }> } }).result.data.find((c) => c.name === `Farverig ${RID}`)!;
  const staffel = await (await api.get(`/trpc/pricing.staffel?input=${encodeURIComponent(JSON.stringify({ companyId: co.id, variantId: entry!.variantId }))}`)).json();
  const stufen = (staffel as { result: { data: { staffeln: Array<{ minMenge: number; ekCents: number }> } } }).result.data.staffeln;
  expect(stufen.map((s) => [s.minMenge, s.ekCents])).toEqual([[1, 437], [10, 402], [25, 353], [50, 321], [100, 304], [250, 287]]);

  await api.dispose();
});
