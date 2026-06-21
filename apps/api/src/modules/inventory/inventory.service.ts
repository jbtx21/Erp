// Inventur auf dem F4-Bewegungs-Ledger (B16, Kap. 37.1). Eine Inventur SETZT den
// Bestand NICHT direkt, sondern bucht die Differenz (Ist − Soll) als INVENTUR-
// Korrekturbeleg über den StockService — auditierbar, append-only (G2).

import { inventoryCorrectionDelta, type StockLager } from "@texma/shared";
import { StockService } from "../stock/stock.service.js";

export interface InventoryCountInput {
  variantId: string;
  /** Gezählter Ist-Bestand. */
  countedQty: number;
  lager?: StockLager;
  belegRef?: string | null;
}

export interface InventoryResult {
  /** Korrektur-Delta (Ist − Buchbestand); 0 = kein Beleg nötig. */
  delta: number;
  corrected: boolean;
}

export class InventoryService {
  constructor(private readonly stock: StockService) {}

  /** Erfasst eine Zählung und bucht bei Abweichung einen INVENTUR-Korrekturbeleg. */
  async recordCount(input: InventoryCountInput): Promise<InventoryResult> {
    if (!Number.isInteger(input.countedQty) || input.countedQty < 0) {
      throw new Error("countedQty must be a non-negative integer");
    }
    const lager: StockLager = input.lager ?? "HAUPT";
    const book = (await this.stock.balance(input.variantId))[lager];
    const delta = inventoryCorrectionDelta(input.countedQty, book);
    if (delta === 0) return { delta: 0, corrected: false };

    await this.stock.post({
      variantId: input.variantId,
      deltaQty: delta,
      grund: "INVENTUR",
      lager,
      belegRef: input.belegRef ?? "Inventur",
    });
    return { delta, corrected: true };
  }
}
