import { describe, expect, it } from "vitest";
import {
  mapFhbNexmartCatalog,
  mapHakroCatalog,
  mapIdIdentityCatalog,
  mapStanleyStellaCatalog,
  mapSupplierCatalog,
  mapSupplierCatalogItem,
  SupplierCatalogError,
} from "./supplier-catalog.js";

describe("mapIdIdentityCatalog (C3)", () => {
  it("mappt ProductFields.ItemId→supplierSku, EAN13Code→sku, Prices.Price.Price→EK, StockLevel", () => {
    const item = mapIdIdentityCatalog({
      StockLevel: 120,
      ProductFields: { ItemId: "0020-001-007", EAN13Code: "5709245283029" },
      Prices: { Price: { Price: "5.90" } },
    });
    expect(item).toEqual({
      supplierSku: "0020-001-007",
      sku: "5709245283029",
      ekCents: 590,
      availableQty: 120,
    });
  });

  it("setzt availableQty auf null, wenn StockLevel fehlt", () => {
    const item = mapIdIdentityCatalog({
      ProductFields: { ItemId: "0021-002-003", EAN13Code: "5709245283030" },
      Prices: { Price: { Price: 7.45 } },
    });
    expect(item.availableQty).toBeNull();
    expect(item.ekCents).toBe(745);
  });

  it("wirft bei fehlender EAN13Code", () => {
    expect(() =>
      mapIdIdentityCatalog({ ProductFields: { ItemId: "0022-001-001" }, Prices: { Price: { Price: "1.00" } } })
    ).toThrow(SupplierCatalogError);
  });
});

describe("mapStanleyStellaCatalog (C3)", () => {
  it("mappt B2BSKUREF→supplierSku, EAN→sku, zusammengeführten EK/Bestand", () => {
    const item = mapStanleyStellaCatalog({
      B2BSKUREF: "STTU755C001L",
      EAN: "3666341234567",
      ekEur: "4.25",
      stockQty: 1500,
    });
    expect(item).toEqual({
      supplierSku: "STTU755C001L",
      sku: "3666341234567",
      ekCents: 425,
      availableQty: 1500,
    });
  });
});

describe("mapHakroCatalog (C3 Phase 2)", () => {
  it("mappt Artikelnummer/Hersteller-SKU/EK (Dezimalkomma)/Bestand", () => {
    const item = mapHakroCatalog({
      artikelNummer: "0292-035-L",
      herstellerSku: "HAK-292-035-L",
      einkaufspreis: "8,90", // deutsches Dezimalkomma
      bestand: 540,
    });
    expect(item).toEqual({
      supplierSku: "0292-035-L",
      sku: "HAK-292-035-L",
      ekCents: 890,
      availableQty: 540,
    });
  });
});

describe("mapFhbNexmartCatalog (C3 Phase 2)", () => {
  it("mappt SUPPLIER_AID/BUYER_AID/Preis und verschachtelten Bestand", () => {
    const item = mapFhbNexmartCatalog({
      supplierAID: "FHB-12345",
      buyerAID: "TS-RED-L",
      priceAmount: "12.50",
      stock: { quantity: 75 },
    });
    expect(item).toEqual({
      supplierSku: "FHB-12345",
      sku: "TS-RED-L",
      ekCents: 1250,
      availableQty: 75,
    });
  });

  it("setzt availableQty auf null, wenn der Bestand fehlt", () => {
    const item = mapFhbNexmartCatalog({
      supplierAID: "FHB-12346",
      buyerAID: "TS-BLK-M",
      priceAmount: 9.9,
    });
    expect(item.availableQty).toBeNull();
    expect(item.ekCents).toBe(990);
  });
});

describe("mapSupplierCatalog Dispatcher", () => {
  it("verteilt eine Liste nach Connector-Art", () => {
    const items = mapSupplierCatalog(
      [
        { StockLevel: 5, ProductFields: { ItemId: "A1", EAN13Code: "S1" }, Prices: { Price: { Price: "1.00" } } },
        { StockLevel: 0, ProductFields: { ItemId: "A2", EAN13Code: "S2" }, Prices: { Price: { Price: "2.50" } } },
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
