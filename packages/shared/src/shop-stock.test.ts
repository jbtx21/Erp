import { describe, expect, it } from "vitest";
import { shopStockQty } from "./shop-stock.js";

describe("shopStockQty (Pseudo-Bestand)", () => {
  it("zieht den Puffer vom verfügbaren Bestand ab", () => {
    expect(shopStockQty(100, 20)).toBe(80);
  });
  it("meldet nie negativ", () => {
    expect(shopStockQty(10, 20)).toBe(0);
    expect(shopStockQty(-5, 0)).toBe(0);
  });
  it("behandelt negativen Puffer als 0", () => {
    expect(shopStockQty(50, -10)).toBe(50);
  });
  it("ohne Puffer = verfügbarer Bestand", () => {
    expect(shopStockQty(42, 0)).toBe(42);
  });
});
