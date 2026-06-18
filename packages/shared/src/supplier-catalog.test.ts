import { describe, expect, it } from "vitest";
import {
  mapIdIdentityCatalog,
  mapStanleyStellaCatalog,
  mapSupplierCatalog,
  mapSupplierCatalogItem,
  SupplierCatalogError,
} from "./supplier-catalog.js";

describe("mapIdIdentityCatalog (C3)", () => {
  it("normalisiert Artikelnummer, Hersteller-SKU, EK und Bestand", () => {
    const item = mapIdIdentityCatalog({
      articleNumber: "IDI-0020",
      manufacturerSku: "0020-RED-L",
      purchasePriceEur: "5.90",
      stock: 120,
    });
    expect(item).toEqual({
      supplierSku: "IDI-0020",
      sku: "0020-RED-L",
      ekCents: 590,
      availableQty: 120,
    });
  });

  it("setzt availableQty auf null, wenn der Bestand fehlt", () => {
    const item = mapIdIdentityCatalog({
      articleNumber: "IDI-0021",
      manufacturerSku: "0021-BLK-M",
      purchasePriceEur: 7.45,
    });
    expect(item.availableQty).toBeNull();
    expect(item.ekCents).toBe(745);
  });

  it("wirft bei fehlender Hersteller-SKU", () => {
    expect(() =>
      mapIdIdentityCatalog({ articleNumber: "IDI-0022", purchasePriceEur: "1.00" })
    ).toThrow(SupplierCatalogError);
  });
});

describe("mapStanleyStellaCatalog (C3)", () => {
  it("mappt Variantencode→supplierSku, EAN→sku, B2B-Preis→ekCents", () => {
    const item = mapStanleyStellaCatalog({
      variantCode: "STTU755C001L",
      ean: "3666341234567",
      prices: { wholesale: "4.25" },
      availableQuantity: 1500,
    });
    expect(item).toEqual({
      supplierSku: "STTU755C001L",
      sku: "3666341234567",
      ekCents: 425,
      availableQty: 1500,
    });
  });
});

describe("mapSupplierCatalog Dispatcher", () => {
  it("verteilt eine Liste nach Connector-Art", () => {
    const items = mapSupplierCatalog(
      [
        { articleNumber: "A1", manufacturerSku: "S1", purchasePriceEur: "1.00", stock: 5 },
        { articleNumber: "A2", manufacturerSku: "S2", purchasePriceEur: "2.50", stock: 0 },
      ],
      "ID_IDENTITY"
    );
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ sku: "S2", ekCents: 250, availableQty: 0 });
  });

  it("wirft für Lieferanten ohne Katalog-Mapper (z. B. MANUAL)", () => {
    expect(() => mapSupplierCatalogItem({}, "MANUAL")).toThrow(/Kein Katalog-Mapper/);
  });
});
