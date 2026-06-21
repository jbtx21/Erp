// In-Memory-Kassen-Repository für Unit-Tests/Dev. Append-only: Belege werden nur
// angehängt, nie geändert.

import type { CashSalePersistInput, PosRepository } from "../modules/pos/pos.service.js";

export interface StoredCashSale extends CashSalePersistInput {
  id: string;
}

export class InMemoryPosRepository implements PosRepository {
  readonly sales: StoredCashSale[] = [];
  private seq = 0;

  async createSale(input: CashSalePersistInput): Promise<{ id: string }> {
    const id = `sale_${++this.seq}`;
    this.sales.push({ id, ...input });
    return { id };
  }
}
