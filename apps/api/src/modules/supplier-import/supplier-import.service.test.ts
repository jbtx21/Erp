// Lieferanten-Katalog-Import (C3): Variantenauflösung per sku, Idempotenz über
// (supplierId, variantId), Überspringen unbekannter SKUs. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import type { SupplierCatalogItem } from "@texma/shared";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemorySupplierRepository } from "../../repositories/in-memory-supplier.repository.js";
import { SupplierImportService } from "./supplier-import.service.js";

const SUP = "sup_id_identity";

function setup() {
  // Zwei vorhandene Varianten; "S-UNKNOWN" existiert nicht.
  const repo = new InMemorySupplierRepository(
    new Map([
      ["0020-RED-L", "var_1"],
      ["0021-BLK-M", "var_2"],
    ])
  );
  const service = new SupplierImportService(repo, new MemoryAuditSink());
  return { repo, service };
}

const item = (sku: string, ekCents: number, availableQty: number | null = null): SupplierCatalogItem => ({
  supplierSku: `IDI-${sku}`,
  sku,
  ekCents,
  availableQty,
});

describe("SupplierImportService.ingestCatalog (C3)", () => {
  it("legt SupplierItems für bekannte SKUs an und überspringt unbekannte", async () => {
    const { repo, service } = setup();
    const res = await service.ingestCatalog(SUP, [
      item("0020-RED-L", 590, 120),
      item("S-UNKNOWN", 999, 5),
      item("0021-BLK-M", 745, 0),
    ]);

    expect(res.upserted).toBe(2);
    expect(res.skipped).toBe(1);
    expect(res.skippedSkus).toEqual(["S-UNKNOWN"]);

    const items = await repo.listItems(SUP, 50);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.variantId === "var_1")).toMatchObject({
      ekCents: 590,
      availableQty: 120,
      supplierSku: "IDI-0020-RED-L",
    });
  });

  it("legt unbekannte SKUs mit createUnknown als Artikel + Variante an (Säule C)", async () => {
    const { repo, service } = setup();
    const enriched: SupplierCatalogItem = {
      supplierSku: "IDI-NEU-1", sku: "EAN-NEU-1", ekCents: 880, availableQty: 30,
      articleName: "Neues Polo", parentSku: "POLO-NEU", farbe: "Navy", groesse: "M",
    };
    const res = await service.ingestCatalog(SUP, [enriched], { createUnknown: true });
    expect(res.created).toBe(1);
    expect(res.upserted).toBe(1);
    expect(res.skipped).toBe(0);
    // Variante wurde mit Merkmalen + Lieferanten-SKU angelegt und ist EK-verknüpft.
    const v = [...repo.createdVariants.values()][0]!;
    expect(v.sku).toBe("EAN-NEU-1");
    expect(v.attributes).toEqual([{ name: "Farbe", value: "Navy" }, { name: "Größe", value: "M" }]);
    const items = await repo.listItems(SUP, 50);
    expect(items[0]).toMatchObject({ variantId: v.id, ekCents: 880 });
    // Zweiter Lauf: SKU jetzt bekannt → nur Update, kein neuer Artikel.
    const second = await service.ingestCatalog(SUP, [enriched], { createUnknown: true });
    expect(second.created).toBe(0);
    expect(second.upserted).toBe(1);
  });

  it("ist idempotent: zweiter Lauf aktualisiert statt zu duplizieren", async () => {
    const { repo, service } = setup();
    await service.ingestCatalog(SUP, [item("0020-RED-L", 590, 120)]);
    const second = await service.ingestCatalog(SUP, [item("0020-RED-L", 610, 80)]);

    expect(second.upserted).toBe(1);
    const items = await repo.listItems(SUP, 50);
    expect(items).toHaveLength(1); // kein Duplikat
    expect(items[0]).toMatchObject({ ekCents: 610, availableQty: 80 }); // EK/Bestand fortgeschrieben
  });
});
