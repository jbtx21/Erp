import { describe, expect, it } from "vitest";
import { GoodsReceiptError, GoodsReceiptService } from "./goods-receipt.service.js";
import { InMemoryGoodsReceiptRepository } from "../../repositories/in-memory-goods-receipt.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

function setup() {
  const repo = new InMemoryGoodsReceiptRepository([
    {
      id: "po1", number: "BE-2026-0001", supplierName: "FHB", status: "BESTELLT", productionId: "pa1",
      lines: [
        { variantId: "v1", label: "Polo rot (POLO-1)", orderedQty: 100, ekCents: 500 },
        { variantId: "v2", label: "Cap (CAP-1)", orderedQty: 50, ekCents: 300 },
      ],
    },
  ]);
  return { repo, svc: new GoodsReceiptService(repo, new MemAudit()) };
}

describe("GoodsReceiptService.record (T-05/Kap. 6.3)", () => {
  it("Teil-Wareneingang setzt den Status auf TEILWEISE_ERHALTEN", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }] });
    expect(r.status).toBe("TEILWEISE_ERHALTEN"); // v2 fehlt noch
  });

  it("vollständiger Wareneingang aller Positionen setzt ERHALTEN", async () => {
    const { svc } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }] });
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v2", receivedQty: 50 }] });
    expect(r.status).toBe("ERHALTEN");
  });

  it("kumuliert Teilmengen je Variante über mehrere Wareneingänge", async () => {
    const { svc } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 60 }] });
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 40 }, { variantId: "v2", receivedQty: 50 }] });
    expect(r.status).toBe("ERHALTEN");
  });

  it("erledigte Bestellungen verschwinden aus der offenen Liste", async () => {
    const { svc, repo } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }, { variantId: "v2", receivedQty: 50 }] });
    expect(await repo.listOpenPurchaseOrders()).toHaveLength(0);
  });

  it("weist leere Erfassung und unbekannte Varianten ab", async () => {
    const { svc } = setup();
    await expect(svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 0 }] })).rejects.toBeInstanceOf(GoodsReceiptError);
    await expect(svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "vX", receivedQty: 5 }] })).rejects.toBeInstanceOf(GoodsReceiptError);
  });
});

describe("EK-Abgleich beim Wareneingang gegen die Bestellung (Kap. 9.6)", () => {
  it("kein Eingangs-EK erfasst → kein Abgleich (ekCheck null)", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }] });
    expect(r.ekCheck).toBeNull();
  });

  it("Eingangs-EK = Bestell-EK → OK", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100, ekCents: 500 }] });
    expect(r.ekCheck?.overall).toBe("OK");
    expect(r.ekCheck?.lines[0]).toMatchObject({ verdict: "OK", masterEkCents: 500 });
  });

  it("Eingangs-EK über Toleranz → ABWEICHUNG (Wareneingang wird trotzdem gebucht)", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100, ekCents: 560 }] }); // +12 %
    expect(r.status).toBe("TEILWEISE_ERHALTEN"); // Buchung erfolgt
    expect(r.ekCheck?.overall).toBe("ABWEICHUNG");
    expect(r.ekCheck?.lines[0]?.diffCents).toBe(60);
  });
});
