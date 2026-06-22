// Mehrfach-Teillieferung: mehrere Teil-Lieferscheine, Restmengen, Überlieferungs-Schutz,
// echter Lieferstatus aus gelieferter vs. bestellter Menge. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryDeliveryRepository } from "../../repositories/in-memory-delivery.repository.js";
import { DeliveryError, DeliveryService } from "./delivery.service.js";

function setup(): { repo: InMemoryDeliveryRepository; svc: DeliveryService } {
  const repo = new InMemoryDeliveryRepository("o1", [
    { orderLineId: "l1", position: 1, description: "Polo Blau XL", orderedQty: 10 },
    { orderLineId: "l2", position: 2, description: "Cap Schwarz", orderedQty: 4 },
  ]);
  return { repo, svc: new DeliveryService(repo, new MemoryAuditSink()) };
}

describe("DeliveryService — Mehrfach-Teillieferung", () => {
  it("erste Teillieferung setzt Lieferstatus TEILWEISE", async () => {
    const { repo, svc } = setup();
    const r = await svc.createDeliveryNote("o1", [{ orderLineId: "l1", qty: 4 }]);
    expect(r.lieferstatus).toBe("TEILWEISE");
    expect(repo.lieferstatus).toBe("TEILWEISE");
    const rem = await svc.remaining("o1");
    expect(rem.find((l) => l.orderLineId === "l1")?.remainingQty).toBe(6);
  });

  it("mehrere Lieferungen bis vollständig → VOLL", async () => {
    const { svc } = setup();
    await svc.createDeliveryNote("o1", [{ orderLineId: "l1", qty: 6 }, { orderLineId: "l2", qty: 4 }]);
    const r2 = await svc.createDeliveryNote("o1", [{ orderLineId: "l1", qty: 4 }]);
    expect(r2.lieferstatus).toBe("VOLL");
    expect(await svc.listDeliveryNotes("o1")).toHaveLength(2);
  });

  it("blockiert Überlieferung", async () => {
    const { svc } = setup();
    await expect(svc.createDeliveryNote("o1", [{ orderLineId: "l1", qty: 11 }])).rejects.toBeInstanceOf(DeliveryError);
    await svc.createDeliveryNote("o1", [{ orderLineId: "l1", qty: 10 }]);
    await expect(svc.createDeliveryNote("o1", [{ orderLineId: "l1", qty: 1 }])).rejects.toBeInstanceOf(DeliveryError); // Rest 0
  });

  it("weist fremde Positionen und leere Lieferungen ab", async () => {
    const { svc } = setup();
    await expect(svc.createDeliveryNote("o1", [{ orderLineId: "fremd", qty: 1 }])).rejects.toBeInstanceOf(DeliveryError);
    await expect(svc.createDeliveryNote("o1", [{ orderLineId: "l1", qty: 0 }])).rejects.toBeInstanceOf(DeliveryError);
    await expect(svc.createDeliveryNote("unbekannt", [{ orderLineId: "l1", qty: 1 }])).rejects.toBeInstanceOf(DeliveryError);
  });
});
