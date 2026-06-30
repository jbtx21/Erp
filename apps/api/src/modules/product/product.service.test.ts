import { describe, expect, it } from "vitest";
import { ProductError, ProductService } from "./product.service.js";
import { InMemoryProductRepository } from "../../repositories/in-memory-product.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

// Pflicht-Basisfelder (überall hart): jede Anlage trägt Beschreibung + EK + VK + Lieferant.
const SUP = "sup_textil";
const BASE = { description: "Beschreibung", ekCents: 0, vkCents: 0, supplierId: SUP } as const;

async function setup(): Promise<{ svc: ProductService; repo: InMemoryProductRepository }> {
  const repo = new InMemoryProductRepository();
  repo.addSupplier(SUP); // jeder Artikel hat genau einen Lieferanten (Kap. 4.4)
  const svc = new ProductService(repo, new MemAudit());
  await svc.createArticle({ sku: "A-1", name: "Poloshirt", ...BASE });
  await svc.createArticle({ sku: "A-2", name: "Cap", ...BASE });
  return { svc, repo };
}

describe("ProductService — PIM-Vollständigkeit + Bearbeitung", () => {
  it("listet Artikel mit Vollständigkeit (anfangs unvollständig)", async () => {
    const { svc } = await setup();
    const rows = await svc.listArticles();
    // Beschreibung ist gesetzt (Pflichtfeld), weitere PIM-Felder fehlen → unvollständig.
    expect(rows[0]?.completeness.percent).toBeLessThan(100);
    expect(rows[0]?.completeness.missing).toContain("Marke");
  });

  it("Schnellbearbeitung: aktualisiert Felder eines Artikels und hebt die Vollständigkeit", async () => {
    const { svc, repo } = await setup();
    const id = (await repo.listArticles())[0]!.id;
    await svc.updateArticle(id, { brand: "TEXMA", materialComposition: "100% Baumwolle" });
    const row = (await svc.listArticles()).find((r) => r.id === id)!;
    expect(row.brand).toBe("TEXMA");
    // Beschreibung (Pflicht) + Marke + Material = 3 gefüllte PIM-Felder.
    expect(row.completeness.filled).toBe(3);
  });

  it("verbietet leeren Namen bei der Bearbeitung", async () => {
    const { svc, repo } = await setup();
    const id = (await repo.listArticles())[0]!.id;
    await expect(svc.updateArticle(id, { name: "  " })).rejects.toBeInstanceOf(ProductError);
  });

  it("erzwingt alle 6 Pflichtfelder bei der Anlage (inkl. Lieferant)", async () => {
    const { svc } = await setup();
    await expect(svc.createArticle({ sku: "  ", name: "X", ...BASE })).rejects.toBeInstanceOf(ProductError);
    await expect(svc.createArticle({ sku: "X-9", name: "X", description: "  ", ekCents: 0, vkCents: 0, supplierId: SUP })).rejects.toBeInstanceOf(ProductError);
    await expect(svc.createArticle({ sku: "X-9", name: "X", description: "ok", ekCents: -1, vkCents: 0, supplierId: SUP })).rejects.toBeInstanceOf(ProductError);
    await expect(svc.createArticle({ sku: "X-9", name: "X", description: "ok", ekCents: 0, vkCents: -1, supplierId: SUP })).rejects.toBeInstanceOf(ProductError);
    // Lieferant fehlt → abgelehnt (jeder Artikel hat genau einen Lieferanten).
    await expect(svc.createArticle({ sku: "X-9", name: "X", description: "ok", ekCents: 0, vkCents: 0, supplierId: "" })).rejects.toBeInstanceOf(ProductError);
    // Unbekannter Lieferant → abgelehnt.
    await expect(svc.createArticle({ sku: "X-9", name: "X", description: "ok", ekCents: 0, vkCents: 0, supplierId: "sup_unbekannt" })).rejects.toBeInstanceOf(ProductError);
  });

  it("speichert EK/VK des Artikels und liefert sie in der Liste", async () => {
    const { svc } = await setup();
    await svc.createArticle({ sku: "P-EKVK", name: "Polo", description: "Polo", ekCents: 450, vkCents: 1290, supplierId: SUP });
    const row = (await svc.listArticles()).find((r) => r.sku === "P-EKVK")!;
    expect(row.ekCents).toBe(450);
    expect(row.vkCents).toBe(1290);
  });

  it("Massenbearbeitung: setzt ein Feld auf mehrere Artikel (per SKU)", async () => {
    const { svc } = await setup();
    const res = await svc.bulkUpdateArticles(["A-1", "A-2"], { originCountry: "DE" });
    expect(res.updated).toBe(2);
    const rows = await svc.listArticles();
    expect(rows.every((r) => r.originCountry === "DE")).toBe(true);
  });

  it("Massenbearbeitung ohne Auswahl/Feld wird abgelehnt", async () => {
    const { svc } = await setup();
    await expect(svc.bulkUpdateArticles([], { brand: "X" })).rejects.toBeInstanceOf(ProductError);
    await expect(svc.bulkUpdateArticles(["A-1"], {})).rejects.toBeInstanceOf(ProductError);
  });

  it("Schnellanlage: legt Artikel + Basis-Variante an und liefert einen wählbaren Katalog-Eintrag", async () => {
    const { svc } = await setup();
    const entry = await svc.quickCreateCatalogEntry({ sku: "T-99", name: "Sweatshirt", ...BASE });
    expect(entry.sku).toBe("T-99");
    expect(entry.unitNetCents).toBe(0);
    expect(entry.label).toBe("Sweatshirt (T-99)");
    const cat = await svc.catalog();
    expect(cat.find((c) => c.variantId === entry.variantId)).toBeTruthy();
  });

  it("Schnellanlage mit Merkmalen bildet eine Varianten-SKU und ein Label mit Merkmalen", async () => {
    const { svc } = await setup();
    const entry = await svc.quickCreateCatalogEntry({
      sku: "T-50", name: "Hoodie", ...BASE, attributes: [{ name: "Farbe", value: "rot" }, { name: "Größe", value: "L" }],
    });
    expect(entry.sku).toBe("T-50-rot-L");
    expect(entry.label).toBe("Hoodie — rot / L (T-50-rot-L)");
  });

  it("Schnellanlage verlangt SKU und Name", async () => {
    const { svc } = await setup();
    await expect(svc.quickCreateCatalogEntry({ sku: "  ", name: "X", ...BASE })).rejects.toBeInstanceOf(ProductError);
    await expect(svc.quickCreateCatalogEntry({ sku: "X-1", name: "  ", ...BASE })).rejects.toBeInstanceOf(ProductError);
  });

  it("Schnellanlage hängt EK (Lieferant) + VK (STANDARD) an die Variante", async () => {
    const { svc, repo } = await setup();
    const entry = await svc.quickCreateCatalogEntry({ sku: "CAP-1", name: "Cap 6-Panel", description: "Cap", ekCents: 350, supplierId: SUP, vkCents: 790 });
    expect(entry.unitNetCents).toBe(790); // VK fließt zurück (Bindung der Position)
    expect(repo.variantPricing.get(entry.variantId)).toMatchObject({ supplierId: SUP, ekCents: 350, vkCents: 790 });
  });

  it("Schnellanlage erzwingt einen Lieferanten; unbekannter Lieferant wird abgelehnt", async () => {
    const { svc, repo } = await setup();
    // Ohne Lieferant ist die Anlage nicht erlaubt (jeder Artikel hat genau einen Lieferanten, Kap. 4.4).
    await expect(svc.quickCreateCatalogEntry({ sku: "CAP-2", name: "Cap", description: "Cap", ekCents: 350, vkCents: 700, supplierId: "" })).rejects.toBeInstanceOf(ProductError);
    // Mit gültigem Lieferant: EK landet als SupplierItem an der Variante.
    const ok = await svc.quickCreateCatalogEntry({ sku: "CAP-2b", name: "Cap", description: "Cap", ekCents: 350, vkCents: 700, supplierId: SUP });
    expect(ok.ekCents).toBe(350);
    expect(repo.variantPricing.get(ok.variantId)).toMatchObject({ supplierId: SUP, ekCents: 350 });
    // Unbekannter Lieferant wird abgelehnt.
    await expect(svc.quickCreateCatalogEntry({ sku: "CAP-3", name: "Cap", description: "Cap", ekCents: 350, vkCents: 700, supplierId: "sup_unbekannt" })).rejects.toBeInstanceOf(ProductError);
  });
});

describe("ProductService — Katalogsuche (skalierbarer Picker)", () => {
  it("filtert serverseitig nach SKU/Name und begrenzt die Treffer", async () => {
    const { svc } = await setup();
    await svc.quickCreateCatalogEntry({ sku: "POLO-NAVY-M", name: "Premium Polo", ...BASE, attributes: [{ name: "Farbe", value: "Navy" }, { name: "Größe", value: "M" }] });
    await svc.quickCreateCatalogEntry({ sku: "POLO-NAVY-L", name: "Premium Polo", ...BASE, attributes: [{ name: "Farbe", value: "Navy" }, { name: "Größe", value: "L" }] });
    await svc.quickCreateCatalogEntry({ sku: "CAP-RED", name: "Basecap", ...BASE, attributes: [{ name: "Farbe", value: "Rot" }] });

    const polo = await svc.searchCatalog("polo", 50);
    expect(polo).toHaveLength(2);
    expect(polo.every((c) => c.articleName === "Premium Polo")).toBe(true);

    const byName = await svc.searchCatalog("basecap", 50);
    expect(byName.map((c) => c.sku)).toEqual(["CAP-RED-Rot"]);

    // Limit begrenzt die Treffermenge.
    expect(await svc.searchCatalog("polo", 1)).toHaveLength(1);
    // Leere Anfrage liefert (begrenzt) den Anfang des Katalogs.
    expect((await svc.searchCatalog("", 2)).length).toBe(2);
  });
});

describe("ProductService — Set/Bundle-Stückliste (Kap. 5.1)", () => {
  it("setzt Komponenten, markiert die Variante als Set und löst Labels auf", async () => {
    const { svc } = await setup();
    const set = await svc.quickCreateCatalogEntry({ sku: "SET-1", name: "Vereins-Set", ...BASE });
    const polo = await svc.quickCreateCatalogEntry({ sku: "POLO-1", name: "Polo", ...BASE, attributes: [{ name: "Farbe", value: "rot" }] });
    await svc.setComponents(set.variantId, [
      { description: "Polo rot", qty: 1, componentVariantId: polo.variantId },
      { description: "Stick Brust links", qty: 1 },
    ]);
    const comps = await svc.listComponents(set.variantId);
    expect(comps).toHaveLength(2);
    expect(comps[0]?.componentLabel).toContain("Polo");
    expect(comps[1]?.componentLabel).toBeNull();
    expect((await svc.catalog()).find((c) => c.variantId === set.variantId)?.isBundle).toBe(true);
  });

  it("verwirft leere Beschreibungen, Selbstreferenz und ungültige Mengen", async () => {
    const { svc } = await setup();
    const set = await svc.quickCreateCatalogEntry({ sku: "SET-2", name: "Set", ...BASE });
    await svc.setComponents(set.variantId, [{ description: "  ", qty: 1 }, { description: "OK", qty: 2 }]);
    expect(await svc.listComponents(set.variantId)).toHaveLength(1);
    await expect(svc.setComponents(set.variantId, [{ description: "Self", qty: 1, componentVariantId: set.variantId }])).rejects.toBeInstanceOf(ProductError);
  });

  it("leere Komponentenliste hebt das Set-Kennzeichen wieder auf", async () => {
    const { svc } = await setup();
    const set = await svc.quickCreateCatalogEntry({ sku: "SET-3", name: "Set", ...BASE });
    await svc.setComponents(set.variantId, [{ description: "X", qty: 1 }]);
    await svc.setComponents(set.variantId, []);
    expect((await svc.catalog()).find((c) => c.variantId === set.variantId)?.isBundle).toBe(false);
  });
});

describe("ProductService — Veredelungs-/Logo-Artikel (Kap. 5.4/11)", () => {
  it("legt ein Logo mit Pflicht-Veredler, EK und Mengenstaffel an", async () => {
    const { svc, repo } = await setup();
    repo.addSupplier("sup_stick");
    const entry = await svc.createVeredelungArticle({
      name: "Logo TSV Emden", sku: "LOGO-EMDEN", method: "STICK", veredlerId: "sup_stick",
      ekCents: 250, tiers: [{ minMenge: 1, vkCents: 600 }, { minMenge: 50, vkCents: 450 }],
    });
    expect(entry.label).toBe("Logo TSV Emden (LOGO-EMDEN)");
    expect(repo.veredelungArticles.get(entry.articleId)).toMatchObject({ veredlerId: "sup_stick", ekCents: 250 });
    expect(repo.veredelungArticles.get(entry.articleId)?.tiers).toHaveLength(2);
  });

  it("erlaubt inhouse-Veredelung ohne Veredler (kein Pflicht-Veredler, keine Fremdvergabe)", async () => {
    const { svc, repo } = await setup();
    // Leerer/fehlender Veredler = inhouse (z. B. 2-farbiger Transferdruck im Haus).
    const entry = await svc.createVeredelungArticle({ name: "Transfer 2-farbig", sku: "TRANS-2C", method: "TRANSFER", veredlerId: "  " });
    expect(repo.veredelungArticles.get(entry.articleId)?.veredlerId).toBeNull();
  });

  it("legt mehrere Platzierungen je Logo an (z. B. Siebdruck vorne + hinten)", async () => {
    const { svc, repo } = await setup();
    repo.addSupplier("sup_druck");
    const entry = await svc.createVeredelungArticle({
      name: "Siebdruck 2-seitig", sku: "SD-2S", method: "DRUCK", veredlerId: "sup_druck",
      placements: ["Brust vorne", "Rücken", "Brust vorne"], // doppelte werden dedupliziert
    });
    expect(repo.veredelungArticles.get(entry.articleId)?.placements).toEqual(["Brust vorne", "Rücken"]);
  });

  it("legt bei Inhouse-Veredelung mit Material-Dienstleister einen Beschaffungs-Lieferanten an (Transfers)", async () => {
    const { svc, repo } = await setup();
    repo.addSupplier("sup_transfer"); // Transfer-Dienstleister
    const entry = await svc.createVeredelungArticle({
      name: "Transfer 2-farbig", sku: "TRANS-2C", method: "TRANSFER",
      veredlerId: null, materialLieferantId: "sup_transfer", ekCents: 120,
    });
    const v = repo.veredelungArticles.get(entry.articleId);
    // Applikation inhouse (kein Veredler), Material wird beim Dienstleister bestellt.
    expect(v?.veredlerId).toBeNull();
    expect(v?.materialSupplierId).toBe("sup_transfer");
  });

  it("reine Inhouse-Veredelung ohne Material-Dienstleister hat keinen Beschaffungs-Lieferanten", async () => {
    const { svc, repo } = await setup();
    const entry = await svc.createVeredelungArticle({ name: "Transfer", sku: "T-INH", method: "TRANSFER", veredlerId: null });
    expect(repo.veredelungArticles.get(entry.articleId)?.materialSupplierId).toBeNull();
  });

  it("weist einen unbekannten Veredler ab", async () => {
    const { svc } = await setup();
    await expect(svc.createVeredelungArticle({ name: "Logo", sku: "L-2", method: "STICK", veredlerId: "sup_unknown" }))
      .rejects.toBeInstanceOf(ProductError);
  });
});
