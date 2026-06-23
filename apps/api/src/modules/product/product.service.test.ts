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
});
