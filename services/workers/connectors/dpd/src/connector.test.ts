import { describe, expect, it, vi } from "vitest";
import { DpdShipmentConnector, type DpdClient, type ShipmentPort } from "./index.js";

describe("DpdShipmentConnector (T-06)", () => {
  it("erzeugt je versandbereitem Auftrag ein Label und meldet das Tracking zurück", async () => {
    const port: ShipmentPort = {
      listShippable: vi.fn().mockResolvedValue([
        {
          id: "order_1",
          number: "WC-500",
          recipient: { name: "ACME GmbH", street: "Hauptstr. 1", zip: "71083", city: "Herrenberg", country: "DE" },
          weightGrams: 1000,
        },
      ]),
      confirmShipped: vi.fn().mockResolvedValue({ ok: true }),
    };
    const requestLabel = vi.fn().mockResolvedValue({ trackingNumber: "DPD123" });
    const client: DpdClient = { requestLabel };

    const res = await new DpdShipmentConnector(client, port).run();

    expect(res).toEqual({ shipped: 1 });
    // Label-Request wird aus Auftragsnummer + Lieferadresse gebaut (buildDpdLabelRequest).
    expect(requestLabel.mock.calls[0]?.[0]).toMatchObject({ reference: "WC-500", parcelCount: 1 });
    // Tracking geht an confirmShipped zurück (→ Auftrag VERSENDET + Outbox-Push).
    expect(port.confirmShipped).toHaveBeenCalledWith("order_1", "DPD123");
  });

  it("ist ein No-op, wenn nichts versandbereit ist", async () => {
    const port: ShipmentPort = {
      listShippable: vi.fn().mockResolvedValue([]),
      confirmShipped: vi.fn(),
    };
    const client: DpdClient = { requestLabel: vi.fn() };
    const res = await new DpdShipmentConnector(client, port).run();
    expect(res).toEqual({ shipped: 0 });
    expect(client.requestLabel).not.toHaveBeenCalled();
  });
});
