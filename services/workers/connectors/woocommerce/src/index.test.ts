import { describe, it, expect, vi } from "vitest";
import { WooCommerceConnector, type WooClient, type OrderIntake } from "./index.js";

describe("WooCommerceConnector (Kap. 3/32)", () => {
  it("importiert alle gepollten Bestellungen über dieselbe Connector-Config (T-01)", async () => {
    const client: WooClient = {
      fetchOrdersSince: vi.fn().mockResolvedValue({
        orders: [{ a: 1 }, { b: 2 }, { c: 3 }],
        nextCursor: "2026-06-18T10:00:00Z",
      }),
    };
    const importWooOrder = vi.fn().mockResolvedValue({ created: true });
    const intake: OrderIntake = { importWooOrder };

    const connector = new WooCommerceConnector(client, intake);
    const res = await connector.run({
      shopConnectorId: "shop_acme",
      companyId: "company_acme",
      cursor: null,
    });

    expect(res.importedCount).toBe(3);
    expect(res.nextCursor).toBe("2026-06-18T10:00:00Z");
    // jeder Import bekommt die Firma aus der Config — nie ein Mitarbeiterkonto
    expect(importWooOrder).toHaveBeenCalledTimes(3);
    expect(importWooOrder.mock.calls[0]?.[1]).toMatchObject({ companyId: "company_acme" });
  });
});
