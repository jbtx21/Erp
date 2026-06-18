import { describe, it, expect } from "vitest";
import { mapWooOrder, type ShopConnectorConfig } from "./woocommerce.js";

// Testfall T-01 (Kap. 15): Eine Shop-Bestellung wird der FIRMA zugeordnet,
// nicht dem einkaufenden Mitarbeiter. Es entstehen keine Phantom-Kunden.

const config: ShopConnectorConfig = {
  shopConnectorId: "shop_acme",
  companyId: "company_acme_gmbh",
};

const wooOrder = {
  id: 4711,
  number: "WC-4711",
  status: "processing",
  billing: { first_name: "Max", last_name: "Mustermann", email: "max@acme.de" },
  line_items: [
    { name: "T-Shirt schwarz / L + Stick Brust", quantity: 5, price: "24.90" },
    { name: "Hoodie navy / M", quantity: 2, price: "39.00" },
  ],
};

describe("mapWooOrder — T-01 Firmenkunde-Mapping", () => {
  it("bindet den Auftrag an die Firma aus der Connector-Config", () => {
    const mapped = mapWooOrder(wooOrder, config);
    expect(mapped.companyId).toBe("company_acme_gmbh");
    expect(mapped.shopConnectorId).toBe("shop_acme");
    expect(mapped.externalNumber).toBe("WC-4711");
  });

  it("übernimmt die Mitarbeiter-Identität NUR als Notiz", () => {
    const mapped = mapWooOrder(wooOrder, config);
    expect(mapped.employeeNote).toBe("Max Mustermann <max@acme.de>");
    // Invariante: nichts im Mapping erzeugt einen Kunden aus dem Mitarbeiterkonto.
    expect(mapped.companyId).not.toContain("Mustermann");
  });

  it("mappt Zeilen mit Cent-Preisen und Roh-Payload", () => {
    const mapped = mapWooOrder(wooOrder, config);
    expect(mapped.lines).toHaveLength(2);
    expect(mapped.lines[0]).toMatchObject({
      position: 1,
      qty: 5,
      unitNetCents: 2490,
    });
    expect(mapped.lines[0]?.rawPayload).toBeDefined();
  });

  it("zwei Bestellungen verschiedener Mitarbeiter bleiben dieselbe Firma", () => {
    const a = mapWooOrder(wooOrder, config);
    const b = mapWooOrder(
      { ...wooOrder, id: 4712, number: "WC-4712", billing: { first_name: "Erika", last_name: "Musterfrau", email: "erika@acme.de" } },
      config
    );
    expect(a.companyId).toBe(b.companyId);
  });

  it("lehnt strukturell ungültige Bestellungen ab", () => {
    expect(() => mapWooOrder({ foo: "bar" }, config)).toThrow();
  });
});
