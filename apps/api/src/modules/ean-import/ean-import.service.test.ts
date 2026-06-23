import { describe, expect, it } from "vitest";
import { EanImportService } from "./ean-import.service.js";
import { InMemoryEanImportRepository } from "../../repositories/in-memory-ean-import.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

const seed = [
  { articleId: "a1", articleName: "Poloshirt", sku: "POLO-001", gtin: "4006381333931" },
  { articleId: "a2", articleName: "Cap", sku: "CAP-007", gtin: null },
];

const csv = [
  "EAN;Artikelnummer;Bezeichnung;Marke;EK (EUR);Gewicht (g)",
  "4006381333931;POLO-001;Poloshirt rot;TEXMA;4,50;180", // Treffer EAN
  "4006381333930;CAP-007;Cap schwarz;TEXMA;2,10;90",     // EAN ungültig → Treffer SKU
  "0012345678905;HOOD-9;Hoodie;TEXMA;9,90;420",          // gültige EAN, kein Bestand
].join("\n");

function svc(): { service: EanImportService; repo: InMemoryEanImportRepository } {
  const repo = new InMemoryEanImportRepository(seed);
  return { service: new EanImportService(repo, new MemAudit()), repo };
}

describe("EanImportService.preview", () => {
  it("liefert den Abgleichplan ohne zu schreiben", async () => {
    const { service, repo } = svc();
    const plan = await service.preview(csv);
    expect(plan.counts).toEqual({ total: 3, matchedEan: 1, matchedSku: 1, unmatched: 1, invalidGtin: 1 });
    expect(repo.prices).toHaveLength(0);
    expect(repo.supplierItems).toHaveLength(0);
  });
});

describe("EanImportService.apply", () => {
  it("aktualisiert PIM nur bei Treffern und überspringt Nicht-Treffer ohne createUnmatched", async () => {
    const { service, repo } = svc();
    const res = await service.apply(csv, { createUnmatched: false, updatePim: true, updateGtinWeight: false });
    expect(res.matchedUpdated).toBe(2);
    expect(res.skipped).toBe(1);
    expect(res.created).toBe(0);
    expect(repo.articles.get("a1")?.pim.brand).toBe("TEXMA");
  });

  it("legt Nicht-Treffer als neuen Artikel + Variante an (createUnmatched)", async () => {
    const { service, repo } = svc();
    const res = await service.apply(csv, { createUnmatched: true, updatePim: false, updateGtinWeight: true });
    expect(res.created).toBe(1);
    // Die neue Variante trägt die EAN aus der Liste.
    const neu = [...repo.variants.values()].find((v) => v.sku === "HOOD-9");
    expect(neu?.gtin).toBe("0012345678905");
  });

  it("setzt die EAN aus der Liste auf eine bislang EAN-lose (per SKU getroffene) Variante", async () => {
    const { service, repo } = svc();
    await service.apply(csv, { createUnmatched: false, updatePim: false, updateGtinWeight: true });
    const cap = [...repo.variants.values()].find((v) => v.sku === "CAP-007");
    expect(cap?.gtin).toBeNull(); // EAN war ungültig → nicht gesetzt
  });

  it("schreibt EK + Lieferantenzuordnung aus der Liste", async () => {
    const { service, repo } = svc();
    const res = await service.apply(csv, { createUnmatched: false, updatePim: false, updateGtinWeight: false, ek: { supplierId: "sup1" } });
    expect(res.ekUpdated).toBe(2);
    expect(repo.supplierItems.find((s) => s.supplierId === "sup1")?.ekCents).toBe(450);
  });

  it("generiert VK-Preise je Preisgruppe über Aufschlag (legt Preisgruppen an)", async () => {
    const { service, repo } = svc();
    const res = await service.apply(csv, {
      createUnmatched: false, updatePim: false, updateGtinWeight: false,
      vk: { groups: [{ kind: "STANDARD", factor: 2 }, { kind: "WIEDERVERKAEUFER", factor: 1.6 }] },
    });
    // 2 Treffer × 2 Gruppen = 4 Preise
    expect(res.pricesWritten).toBe(4);
    expect(repo.priceGroups.has("STANDARD")).toBe(true);
    expect(repo.priceGroups.has("WIEDERVERKAEUFER")).toBe(true);
    // STANDARD-Preis von POLO: 4,50 € EK × 2 = 9,00 €
    const stdId = repo.priceGroups.get("STANDARD");
    const polo = [...repo.variants.values()].find((v) => v.sku === "POLO-001");
    expect(repo.prices.find((p) => p.variantId === polo?.id && p.priceGroupId === stdId)?.netCents).toBe(900);
  });
});
