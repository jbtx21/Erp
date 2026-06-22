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
});
