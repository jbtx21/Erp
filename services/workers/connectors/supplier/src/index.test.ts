import { describe, expect, it, vi } from "vitest";
import { SupplierConnector, type SupplierCatalogClient, type SupplierIntake } from "./index.js";

describe("SupplierConnector (Kap. 6/32, C3)", () => {
  it("mappt gepollte Roh-Items je Connector-Art und pusht sie an den Intake", async () => {
    // Rohformat ID Identity → wird im Connector über mapSupplierCatalog normalisiert.
    const client: SupplierCatalogClient = {
      fetchCatalogSince: vi.fn().mockResolvedValue({
        items: [
          { articleNumber: "IDI-1", manufacturerSku: "0020-RED-L", purchasePriceEur: "5.90", stock: 120 },
          { articleNumber: "IDI-2", manufacturerSku: "0021-BLK-M", purchasePriceEur: "7.45", stock: 0 },
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
});
