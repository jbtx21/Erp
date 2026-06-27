import { describe, expect, it } from "vitest";
import { groupTransferPurchases, planTransferSourcing, type TransferNeed } from "./transfer-sourcing.js";

const need = (p: Partial<TransferNeed> & { variantId: string; needed: number; available: number }): TransferNeed => ({
  sku: p.variantId, bezeichnung: p.variantId, materialSupplierId: null, ekCents: null, ...p,
});

describe("transfer-sourcing (Lager zuerst, Rest bestellen)", () => {
  it("deckt vollständig aus dem Lager, wenn genug verfügbar ist", () => {
    const [l] = planTransferSourcing([need({ variantId: "t1", needed: 30, available: 100 })]);
    expect(l).toMatchObject({ fromStock: 30, toOrder: 0 });
  });

  it("bestellt den vollen Bedarf, wenn kein Bestand da ist", () => {
    const [l] = planTransferSourcing([need({ variantId: "t1", needed: 30, available: 0 })]);
    expect(l).toMatchObject({ fromStock: 0, toOrder: 30 });
  });

  it("teilt bei Teilbestand: Lager-Anteil + Fehlmenge bestellen", () => {
    const [l] = planTransferSourcing([need({ variantId: "t1", needed: 30, available: 18 })]);
    expect(l).toMatchObject({ fromStock: 18, toOrder: 12 });
  });

  it("bündelt Nachbestellungen je Material-Lieferant; Positionen ohne Lieferant separat", () => {
    const lines = planTransferSourcing([
      need({ variantId: "t1", needed: 30, available: 0, materialSupplierId: "sup_a", ekCents: 50 }),
      need({ variantId: "t2", needed: 10, available: 4, materialSupplierId: "sup_a", ekCents: 80 }),
      need({ variantId: "t3", needed: 5, available: 0, materialSupplierId: null }),
      need({ variantId: "t4", needed: 5, available: 99, materialSupplierId: "sup_b" }), // voll aus Lager → keine Bestellung
    ]);
    const { groups, ohneLieferant } = groupTransferPurchases(lines);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.supplierId).toBe("sup_a");
    expect(groups[0]!.lines).toEqual([
      { variantId: "t1", orderQty: 30, ekCents: 50 },
      { variantId: "t2", orderQty: 6, ekCents: 80 },
    ]);
    expect(ohneLieferant.map((l) => l.variantId)).toEqual(["t3"]);
  });
});
