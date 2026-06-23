// Mindestbestand-Nachbestellung (T-12): Vorschlag je Lieferant + Bestellanlage.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryReorderRepository } from "../../repositories/in-memory-reorder.repository.js";
import { ReorderService } from "./reorder.service.js";

function setup() {
  const repo = new InMemoryReorderRepository([
    { variantId: "v1", qty: 3, minStock: 10, supplierId: "s1", ekCents: 500 }, // → 7
    { variantId: "v2", qty: 1, minStock: 4, supplierId: "s1", ekCents: 400 }, // → 3
    { variantId: "v3", qty: 8, minStock: 8, supplierId: "s2", ekCents: 300 }, // kein Vorschlag
  ]);
  return { repo, service: new ReorderService(repo, new MemoryAuditSink()) };
}

describe("ReorderService (T-12)", () => {
  it("bündelt Vorschläge je Lieferant und ignoriert ausreichende Bestände", async () => {
    const { service } = setup();
    const groups = await service.proposals();
    expect(groups).toHaveLength(1); // nur s1
    expect(groups[0]?.lines.map((l) => l.orderQty)).toEqual([7, 3]);
    expect(groups[0]?.totalEkCents).toBe(7 * 500 + 3 * 400);
  });

  it("erzeugt je Lieferant eine Bestellung", async () => {
    const { repo, service } = setup();
    const created = await service.createPurchaseOrders();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ supplierId: "s1", lineCount: 2 });
    expect(repo.createdOrders).toHaveLength(1);
  });

  it("liefert nichts, wenn kein Bestand unterschritten ist", async () => {
    const repo = new InMemoryReorderRepository([{ variantId: "v", qty: 10, minStock: 10, supplierId: "s", ekCents: 1 }]);
    const service = new ReorderService(repo, new MemoryAuditSink());
    expect(await service.proposals()).toHaveLength(0);
    expect(await service.createPurchaseOrders()).toHaveLength(0);
  });
});

import { InMemoryReorderRepository as DemandRepo } from "../../repositories/in-memory-reorder.repository.js";

describe("ReorderService.demandProposals (auftragsübergreifend + Leihgut)", () => {
  it("sammelt Bedarf aus mehreren Aufträgen + Leihgut und verrechnet Bestand", async () => {
    const repo = new DemandRepo([]);
    repo.demand = [
      { variantId: "v1", qty: 10, source: "ORDER", ref: "AB-1" },
      { variantId: "v1", qty: 8, source: "ORDER", ref: "AB-2" },
      { variantId: "v1", qty: 2, source: "LOAN", ref: "Muster-1" },
    ];
    repo.stock = [{ variantId: "v1", qty: 5 }];
    repo.suppliers = [{ variantId: "v1", supplierId: "sup-a", ekCents: 400 }];
    const svc = new ReorderService(repo, { append: async () => {} });
    const props = await svc.demandProposals();
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ variantId: "v1", supplierId: "sup-a", requiredQty: 20, stockQty: 5, orderQty: 15 });
    expect(props[0]?.sources).toHaveLength(3);
  });
});
