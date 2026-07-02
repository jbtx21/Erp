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
    // Auftrag 10+8=18, Muster 2 kommen zurück → Netto-Bedarf 16; abzgl. 5 Bestand → 11 bestellen.
    expect(props[0]).toMatchObject({ variantId: "v1", supplierId: "sup-a", requiredQty: 16, stockQty: 5, orderQty: 11 });
    expect(props[0]?.sources).toHaveLength(3);
  });
});

describe("ReorderService.createDemandPurchaseOrders (MTO — 1-Klick aus Auftragsbedarf, Kap. 6.1)", () => {
  function demandSetup() {
    const repo = new DemandRepo([]);
    repo.demand = [
      { variantId: "v1", qty: 10, source: "ORDER", ref: "AB-1" },
      { variantId: "v1", qty: 8, source: "ORDER", ref: "AB-2" },
      { variantId: "v2", qty: 4, source: "ORDER", ref: "AB-1" },
      { variantId: "v3", qty: 6, source: "ORDER", ref: "AB-3" }, // ohne Hauptlieferant
    ];
    repo.stock = [{ variantId: "v1", qty: 5 }];
    repo.suppliers = [
      { variantId: "v1", supplierId: "sup-a", ekCents: 400 },
      { variantId: "v2", supplierId: "sup-b", ekCents: 300 },
    ];
    repo.supplierNames.set("sup-a", "HAKRO");
    repo.supplierNames.set("sup-b", "Stanley/Stella");
    const audit = new MemoryAuditSink();
    return { repo, audit, service: new ReorderService(repo, audit) };
  }

  it("legt je Hauptlieferant EINE Bestellung an und meldet Bedarf ohne Lieferant zurück", async () => {
    const { repo, service } = demandSetup();
    const res = await service.createDemandPurchaseOrders();
    expect(res.created).toHaveLength(2); // sup-a + sup-b
    expect(res.created.map((c) => c.supplierId).sort()).toEqual(["sup-a", "sup-b"]);
    expect(res.created.find((c) => c.supplierId === "sup-a")).toMatchObject({ supplierName: "HAKRO", lines: 1 });
    expect(repo.createdOrders).toHaveLength(2);
    // v3 hat keinen Hauptlieferanten → übersprungen mit Grund, nicht bestellt.
    expect(res.uebersprungen).toHaveLength(1);
    expect(res.uebersprungen[0]).toMatchObject({ variantId: "v3", orderQty: 6, grund: "Kein Hauptlieferant" });
  });

  it("persistiert die Bedarfsquellen je Bestellposition (PO ↔ Auftrag rückverfolgbar)", async () => {
    const { repo, service } = demandSetup();
    await service.createDemandPurchaseOrders();
    const v1Sources = repo.createdLineSources.filter((s) => s.variantId === "v1");
    expect(v1Sources.map((s) => s.ref).sort()).toEqual(["AB-1", "AB-2"]);
    expect(v1Sources.map((s) => s.qty).sort()).toEqual([10, 8].sort());
  });

  it("hängt je angelegter Bestellung einen Audit-Eintrag an (GoBD)", async () => {
    const { audit, service } = demandSetup();
    const res = await service.createDemandPurchaseOrders();
    expect(audit.entries).toHaveLength(res.created.length);
    expect(audit.entries.every((e) => e.entity === "PurchaseOrder" && e.action === "CREATE")).toBe(true);
    const forA = audit.entries.find((e) => e.entityId === res.created.find((c) => c.supplierId === "sup-a")!.poId);
    expect(forA?.after).toMatchObject({ quelle: "auftragsbedarf" });
  });

  it("legt bei leerem Bedarf nichts an (kein Audit-Rauschen)", async () => {
    const repo = new DemandRepo([]);
    const audit = new MemoryAuditSink();
    const service = new ReorderService(repo, audit);
    const res = await service.createDemandPurchaseOrders();
    expect(res.created).toHaveLength(0);
    expect(res.uebersprungen).toHaveLength(0);
    expect(repo.createdOrders).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });
});
