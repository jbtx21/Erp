import { describe, expect, it } from "vitest";
import { ProductError, ProductService } from "./product.service.js";
import { InMemoryProductRepository } from "../../repositories/in-memory-product.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

async function setup(): Promise<{ svc: ProductService; repo: InMemoryProductRepository }> {
  const repo = new InMemoryProductRepository();
  const svc = new ProductService(repo, new MemAudit());
  await svc.createArticle("A-1", "Poloshirt");
  await svc.createArticle("A-2", "Cap");
  return { svc, repo };
}

describe("ProductService — PIM-Vollständigkeit + Bearbeitung", () => {
  it("listet Artikel mit Vollständigkeit (anfangs unvollständig)", async () => {
    const { svc } = await setup();
    const rows = await svc.listArticles();
    expect(rows[0]?.completeness.percent).toBe(0);
    expect(rows[0]?.completeness.missing).toContain("Marke");
  });

  it("Schnellbearbeitung: aktualisiert Felder eines Artikels und hebt die Vollständigkeit", async () => {
    const { svc, repo } = await setup();
    const id = (await repo.listArticles())[0]!.id;
    await svc.updateArticle(id, { brand: "TEXMA", materialComposition: "100% Baumwolle" });
    const row = (await svc.listArticles()).find((r) => r.id === id)!;
    expect(row.brand).toBe("TEXMA");
    expect(row.completeness.filled).toBe(2);
  });

  it("verbietet leeren Namen bei der Bearbeitung", async () => {
    const { svc, repo } = await setup();
    const id = (await repo.listArticles())[0]!.id;
    await expect(svc.updateArticle(id, { name: "  " })).rejects.toBeInstanceOf(ProductError);
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
    const entry = await svc.quickCreateCatalogEntry({ sku: "T-99", name: "Sweatshirt" });
    expect(entry.sku).toBe("T-99");
    expect(entry.unitNetCents).toBe(0);
    expect(entry.label).toBe("Sweatshirt (T-99)");
    const cat = await svc.catalog();
    expect(cat.find((c) => c.variantId === entry.variantId)).toBeTruthy();
  });

  it("Schnellanlage mit Merkmalen bildet eine Varianten-SKU und ein Label mit Merkmalen", async () => {
    const { svc } = await setup();
    const entry = await svc.quickCreateCatalogEntry({
      sku: "T-50", name: "Hoodie", attributes: [{ name: "Farbe", value: "rot" }, { name: "Größe", value: "L" }],
    });
    expect(entry.sku).toBe("T-50-rot-L");
    expect(entry.label).toBe("Hoodie — rot / L (T-50-rot-L)");
  });

  it("Schnellanlage verlangt SKU und Name", async () => {
    const { svc } = await setup();
    await expect(svc.quickCreateCatalogEntry({ sku: "  ", name: "X" })).rejects.toBeInstanceOf(ProductError);
    await expect(svc.quickCreateCatalogEntry({ sku: "X-1", name: "  " })).rejects.toBeInstanceOf(ProductError);
  });

  it("Schnellanlage hängt EK (Lieferant) + VK (STANDARD) an die Variante", async () => {
    const { svc, repo } = await setup();
    repo.addSupplier("sup_textil");
    const entry = await svc.quickCreateCatalogEntry({ sku: "CAP-1", name: "Cap 6-Panel", ekCents: 350, supplierId: "sup_textil", vkCents: 790 });
    expect(entry.unitNetCents).toBe(790); // VK fließt zurück (Bindung der Position)
    expect(repo.variantPricing.get(entry.variantId)).toMatchObject({ supplierId: "sup_textil", ekCents: 350, vkCents: 790 });
  });

  it("Schnellanlage lehnt EK ohne Lieferant und unbekannten Lieferant ab", async () => {
    const { svc } = await setup();
    await expect(svc.quickCreateCatalogEntry({ sku: "CAP-2", name: "Cap", ekCents: 350 })).rejects.toBeInstanceOf(ProductError);
    await expect(svc.quickCreateCatalogEntry({ sku: "CAP-3", name: "Cap", ekCents: 350, supplierId: "sup_unbekannt" })).rejects.toBeInstanceOf(ProductError);
  });
});

describe("ProductService — Katalogsuche (skalierbarer Picker)", () => {
  it("filtert serverseitig nach SKU/Name und begrenzt die Treffer", async () => {
    const { svc } = await setup();
    await svc.quickCreateCatalogEntry({ sku: "POLO-NAVY-M", name: "Premium Polo", attributes: [{ name: "Farbe", value: "Navy" }, { name: "Größe", value: "M" }] });
    await svc.quickCreateCatalogEntry({ sku: "POLO-NAVY-L", name: "Premium Polo", attributes: [{ name: "Farbe", value: "Navy" }, { name: "Größe", value: "L" }] });
    await svc.quickCreateCatalogEntry({ sku: "CAP-RED", name: "Basecap", attributes: [{ name: "Farbe", value: "Rot" }] });

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
    const set = await svc.quickCreateCatalogEntry({ sku: "SET-1", name: "Vereins-Set" });
    const polo = await svc.quickCreateCatalogEntry({ sku: "POLO-1", name: "Polo", attributes: [{ name: "Farbe", value: "rot" }] });
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
    const set = await svc.quickCreateCatalogEntry({ sku: "SET-2", name: "Set" });
    await svc.setComponents(set.variantId, [{ description: "  ", qty: 1 }, { description: "OK", qty: 2 }]);
    expect(await svc.listComponents(set.variantId)).toHaveLength(1);
    await expect(svc.setComponents(set.variantId, [{ description: "Self", qty: 1, componentVariantId: set.variantId }])).rejects.toBeInstanceOf(ProductError);
  });

  it("leere Komponentenliste hebt das Set-Kennzeichen wieder auf", async () => {
    const { svc } = await setup();
    const set = await svc.quickCreateCatalogEntry({ sku: "SET-3", name: "Set" });
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
