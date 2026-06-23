import { describe, expect, it } from "vitest";
import { InMemoryConnectionsRepository } from "../../repositories/in-memory-connections.repository.js";
import { ConnectionsService, type OrderConnections } from "./connections.service.js";

const graph: OrderConnections = {
  anchor: { entity: "Order", id: "o1", label: "AB-2026-0007", status: "FAKTURIERT", navKey: "orders" },
  groups: [
    { phase: "Vertrieb", nodes: [{ entity: "Quote", id: "q1", label: "AN-2026-0003", status: "ANGENOMMEN", navKey: "quotes" }] },
    { phase: "Fulfillment", nodes: [{ entity: "Invoice", id: "i1", label: "RE-2026-0003", status: "FINALISIERT", navKey: "invoices" }] },
    { phase: "Zahlung", nodes: [{ entity: "OpenItem", id: "op1", label: "Offen 0.00 €", status: "BEZAHLT", navKey: "banking" }] },
  ],
};

describe("ConnectionsService", () => {
  it("liefert die phasen-gruppierte Belegkette eines Auftrags", async () => {
    const service = new ConnectionsService(new InMemoryConnectionsRepository({ o1: graph }));
    const res = await service.orderConnections("o1");
    expect(res?.anchor.label).toBe("AB-2026-0007");
    expect(res?.groups.map((g) => g.phase)).toEqual(["Vertrieb", "Fulfillment", "Zahlung"]);
    expect(res?.groups[0]!.nodes[0]!.label).toBe("AN-2026-0003");
  });

  it("liefert null für einen unbekannten Auftrag", async () => {
    const service = new ConnectionsService(new InMemoryConnectionsRepository({}));
    expect(await service.orderConnections("nope")).toBeNull();
  });
});
