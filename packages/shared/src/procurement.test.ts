import { describe, expect, it } from "vitest";
import {
  canStartProduction,
  componentReceiptStatus,
  openComponents,
  type GoodsReceiptLine,
  type RequiredComponent,
} from "./procurement.js";

const required: RequiredComponent[] = [
  { variantId: "v-shirt", supplierId: "fhb", qty: 50 },
  { variantId: "v-polo", supplierId: "stanley-stella", qty: 20 },
];

describe("Multi-Lieferant Produktionsstart-Gate (T-05)", () => {
  it("blockiert den Start, solange nicht alle Komponenten da sind", () => {
    const receipts: GoodsReceiptLine[] = [
      { variantId: "v-shirt", supplierId: "fhb", receivedQty: 50 },
    ];
    expect(canStartProduction(required, receipts)).toBe(false);
    expect(openComponents(required, receipts)).toEqual([
      {
        variantId: "v-polo",
        supplierId: "stanley-stella",
        requiredQty: 20,
        receivedQty: 0,
        complete: false,
      },
    ]);
  });

  it("gibt den Start frei, wenn beide Lieferungen vollständig sind", () => {
    const receipts: GoodsReceiptLine[] = [
      { variantId: "v-shirt", supplierId: "fhb", receivedQty: 30 },
      { variantId: "v-shirt", supplierId: "fhb", receivedQty: 20 }, // Teillieferungen summieren
      { variantId: "v-polo", supplierId: "stanley-stella", receivedQty: 20 },
    ];
    expect(canStartProduction(required, receipts)).toBe(true);
    expect(openComponents(required, receipts)).toHaveLength(0);
  });

  it("zählt nur Wareneingänge des passenden Lieferanten", () => {
    const receipts: GoodsReceiptLine[] = [
      { variantId: "v-polo", supplierId: "fhb", receivedQty: 20 }, // falscher Lieferant
    ];
    const status = componentReceiptStatus(required, receipts);
    expect(status.find((s) => s.variantId === "v-polo")?.receivedQty).toBe(0);
  });

  it("ohne Bedarf ist der Start frei", () => {
    expect(canStartProduction([], [])).toBe(true);
  });
});
