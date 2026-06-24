import { describe, expect, it, vi } from "vitest";
import { SupplierConnector, type SupplierCatalogClient, type SupplierIntake } from "./index.js";

describe("SupplierConnector (Kap. 6/32, C3)", () => {
  it("mappt gepollte Roh-Items je Connector-Art und pusht sie an den Intake", async () => {
    // Rohformat ID Identity → wird im Connector über mapSupplierCatalog normalisiert.
    const client: SupplierCatalogClient = {
      fetchCatalogSince: vi.fn().mockResolvedValue({
        items: [
          { StockLevel: 120, ProductFields: { ItemId: "IDI-1", EAN13Code: "0020-RED-L" }, Prices: { Price: { Price: "5.90" } } },
          { StockLevel: 0, ProductFields: { ItemId: "IDI-2", EAN13Code: "0021-BLK-M" }, Prices: { Price: { Price: "7.45" } } },
        ],
        nextCursor: "2026-06-18T10:00:00Z",
      }),
    };
    const ingestCatalog = vi.fn().mockResolvedValue({ upserted: 2, skipped: 0 });
    const intake: SupplierIntake = { ingestCatalog };

    const res = await new SupplierConnector(client, intake).run({
      supplierId: "sup_1",
      kind: "ID_IDENTITY",
      cursor: null,
    });

    expect(res).toEqual({ upserted: 2, skipped: 0, nextCursor: "2026-06-18T10:00:00Z" });
    expect(ingestCatalog).toHaveBeenCalledTimes(1);
    const [supplierId, items] = ingestCatalog.mock.calls[0]!;
    expect(supplierId).toBe("sup_1");
    expect(items[0]).toEqual({ supplierSku: "IDI-1", sku: "0020-RED-L", ekCents: 590, availableQty: 120 });
    expect(items[1]).toMatchObject({ sku: "0021-BLK-M", ekCents: 745, availableQty: 0 });
  });

  it("routet das Mapping über die Connector-Art (Phase 2: FHB/nexmart)", async () => {
    const client: SupplierCatalogClient = {
      fetchCatalogSince: vi.fn().mockResolvedValue({
        items: [{ supplierAID: "FHB-1", buyerAID: "TS-RED-L", priceAmount: "12.50", stock: { quantity: 75 } }],
        nextCursor: "2026-06-18T11:00:00Z",
      }),
    };
    const ingestCatalog = vi.fn().mockResolvedValue({ upserted: 1, skipped: 0 });

    const res = await new SupplierConnector(client, { ingestCatalog }).run({
      supplierId: "sup_fhb",
      kind: "FHB_NEXMART",
      cursor: null,
    });

    expect(res).toEqual({ upserted: 1, skipped: 0, nextCursor: "2026-06-18T11:00:00Z" });
    expect(ingestCatalog.mock.calls[0]![1][0]).toEqual({
      supplierSku: "FHB-1",
      sku: "TS-RED-L",
      ekCents: 1250,
      availableQty: 75,
    });
  });
});
