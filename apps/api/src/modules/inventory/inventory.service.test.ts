// Unit-Test der Inventur (B16) gegen das In-Memory-F4-Ledger — ohne DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryStockRepository } from "../../repositories/in-memory-stock.repository.js";
import { StockService } from "../stock/stock.service.js";
import { InventoryService } from "./inventory.service.js";

const VAR = "var-inv";

function setup() {
  const repo = new InMemoryStockRepository();
  const stock = new StockService(repo, new MemoryAuditSink());
  const inventory = new InventoryService(stock);
  return { repo, stock, inventory };
}

describe("InventoryService.recordCount (B16)", () => {
  it("bucht die Differenz als INVENTUR-Korrektur und korrigiert den Saldo", async () => {
    const { stock, inventory } = setup();
    await stock.post({ variantId: VAR, deltaQty: 100, grund: "WARENEINGANG" });

    const res = await inventory.recordCount({ variantId: VAR, countedQty: 95 });
    expect(res).toEqual({ delta: -5, corrected: true });
    expect((await stock.balance(VAR)).HAUPT).toBe(95);
  });

  it("erzeugt keinen Beleg, wenn Ist = Soll", async () => {
    const { stock, inventory } = setup();
    await stock.post({ variantId: VAR, deltaQty: 100, grund: "WARENEINGANG" });

    const res = await inventory.recordCount({ variantId: VAR, countedQty: 100 });
    expect(res).toEqual({ delta: 0, corrected: false });
    expect((await stock.balance(VAR)).HAUPT).toBe(100);
  });

  it("bucht auch einen positiven Mehrbestand", async () => {
    const { stock, inventory } = setup();
    await stock.post({ variantId: VAR, deltaQty: 100, grund: "WARENEINGANG" });

    const res = await inventory.recordCount({ variantId: VAR, countedQty: 110 });
    expect(res).toEqual({ delta: 10, corrected: true });
    expect((await stock.balance(VAR)).HAUPT).toBe(110);
  });

  it("zählt getrennt je Lager (MUSTER)", async () => {
    const { stock, inventory } = setup();
    await stock.post({ variantId: VAR, deltaQty: 20, grund: "MUSTER", lager: "MUSTER" });

    const res = await inventory.recordCount({ variantId: VAR, countedQty: 18, lager: "MUSTER" });
    expect(res.delta).toBe(-2);
    expect((await stock.balance(VAR)).MUSTER).toBe(18);
    expect((await stock.balance(VAR)).HAUPT).toBe(0);
  });

  it("lehnt negative Zählwerte ab", async () => {
    const { inventory } = setup();
    await expect(inventory.recordCount({ variantId: VAR, countedQty: -1 })).rejects.toThrow();
  });
});
