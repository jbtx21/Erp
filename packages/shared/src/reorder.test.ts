import { describe, expect, it } from "vitest";
import { computeReorderProposals, groupReorderBySupplier } from "./reorder.js";

const cand = (variantId: string, qty: number, minStock: number, supplierId: string, ekCents: number) => ({
  variantId,
  qty,
  minStock,
  supplierId,
  ekCents,
});

describe("computeReorderProposals (T-12)", () => {
  it("schlägt nur für unterschrittene Bestände vor (Menge bis Mindestbestand)", () => {
    const proposals = computeReorderProposals([
      cand("v1", 3, 10, "s1", 500), // unterschritten → 7
      cand("v2", 10, 10, "s1", 400), // genau am Mindestbestand → kein Vorschlag
      cand("v3", 20, 5, "s2", 300), // ausreichend → kein Vorschlag
    ]);
    expect(proposals).toEqual([{ variantId: "v1", supplierId: "s1", orderQty: 7, ekCents: 500 }]);
  });
});

describe("groupReorderBySupplier (Kap. 6.1)", () => {
  it("bündelt je Lieferant und summiert den Bestellwert", () => {
    const groups = groupReorderBySupplier([
      { variantId: "v1", supplierId: "s1", orderQty: 7, ekCents: 500 },
      { variantId: "v2", supplierId: "s1", orderQty: 2, ekCents: 400 },
      { variantId: "v3", supplierId: "s2", orderQty: 5, ekCents: 300 },
    ]);
    const s1 = groups.find((g) => g.supplierId === "s1");
    expect(s1?.lines).toHaveLength(2);
    expect(s1?.totalEkCents).toBe(7 * 500 + 2 * 400);
    expect(groups.find((g) => g.supplierId === "s2")?.totalEkCents).toBe(1500);
  });
});
