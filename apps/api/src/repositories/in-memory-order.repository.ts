// In-Memory-Implementierung der Auftrags-Repositories — für Tests und lokale
// Durchstiche ohne DB. Bildet die T-01-Invariante ab: der Import legt NIE eine
// Firma an; countCompanies basiert auf der vorab gesetzten Firmenmenge.

import type {
  CreatedOrder,
  OrderRepository,
} from "../modules/shop-import/order-import.service.js";
import type { MappedOrder } from "@texma/shared";
import type { OrderListItem, OrderQueryRepository } from "./read.js";

interface StoredOrder {
  id: string;
  number: string;
  companyId: string;
  shopConnectorId: string;
  externalNumber: string;
  employeeNote: string;
  createdAt: Date;
}

export class InMemoryOrderRepository
  implements OrderRepository, OrderQueryRepository
{
  private readonly orders: StoredOrder[] = [];
  private seq = 0;

  /** companyIds = bereits existierende Firmen (Stammdaten). Wächst durch Import NICHT. */
  constructor(private readonly companyIds: Set<string>) {}

  async findByExternalNumber(
    shopConnectorId: string,
    externalNumber: string
  ): Promise<CreatedOrder | null> {
    const o = this.orders.find(
      (x) => x.shopConnectorId === shopConnectorId && x.externalNumber === externalNumber
    );
    return o ? { id: o.id, number: o.number, companyId: o.companyId } : null;
  }

  async createFromShop(mapped: MappedOrder): Promise<CreatedOrder> {
    const id = `order_${++this.seq}`;
    const number = `WC-${mapped.externalNumber}`;
    this.orders.push({
      id,
      number,
      companyId: mapped.companyId,
      shopConnectorId: mapped.shopConnectorId,
      externalNumber: mapped.externalNumber,
      employeeNote: mapped.employeeNote,
      createdAt: new Date(),
    });
    return { id, number, companyId: mapped.companyId };
  }

  async countCompanies(): Promise<number> {
    return this.companyIds.size;
  }

  async listRecent(limit: number): Promise<OrderListItem[]> {
    return this.orders
      .slice(-limit)
      .reverse()
      .map((o) => ({
        id: o.id,
        number: o.number,
        companyId: o.companyId,
        externalNumber: o.externalNumber,
        employeeNote: o.employeeNote,
        createdAt: o.createdAt,
      }));
  }
}
